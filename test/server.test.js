import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import { WebSocket } from 'ws';

async function unusedPort() {
  const probe = createTcpServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function waitForOutput(child, expected, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Server did not announce ${expected}`)), timeoutMs);
    let output = '';
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(expected)) finish();
    };
    const onExit = (code) => finish(new Error(`Server exited with code ${code}: ${output}`));
    function finish(error) {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      error ? reject(error) : resolve();
    }
    child.stdout.on('data', onData);
    child.once('exit', onExit);
  });
}

function connect(url, origin) {
  const options = origin === undefined ? {} : { headers: { Origin: origin } };
  const socket = new WebSocket(url, options);
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function rejectedHandshakeStatus(url, origin) {
  const options = origin === undefined ? {} : { headers: { Origin: origin } };
  const socket = new WebSocket(url, options);
  return new Promise((resolve, reject) => {
    socket.once('open', () => {
      socket.terminate();
      reject(new Error('The server accepted a WebSocket handshake with an invalid Origin'));
    });
    socket.once('unexpected-response', (_request, response) => {
      const { statusCode } = response;
      response.resume();
      resolve(statusCode);
    });
    socket.once('error', reject);
  });
}

function waitForRoomState(socket, predicate, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for room state')), timeoutMs);
    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === 'error') finish(new Error(message.message));
      else if (message.type === 'room_state' && predicate(message)) finish(null, message);
    };
    function finish(error, result) {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      error ? reject(error) : resolve(result);
    }
    socket.on('message', onMessage);
  });
}

function waitForRoomError(socket, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for a room error')), timeoutMs);
    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message.type === 'error') finish(null, message.message);
    };
    function finish(error, result) {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      error ? reject(error) : resolve(result);
    }
    socket.on('message', onMessage);
  });
}

function waitForClose(socket, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for the socket to close')), timeoutMs);
    const onClose = (code, reason) => finish(null, { code, reason: reason.toString() });
    function finish(error, result) {
      clearTimeout(timeout);
      socket.off('close', onClose);
      error ? reject(error) : resolve(result);
    }
    socket.once('close', onClose);
  });
}

function send(socket, payload) {
  socket.send(JSON.stringify(payload));
}

function closeSocket(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once('close', resolve);
    socket.close();
    setTimeout(resolve, 500).unref();
  });
}

async function startTestServer(t) {
  const port = await unusedPort();
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sockets = new Set();
  const origin = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/ws`;

  t.after(async () => {
    await Promise.all([...sockets].map(closeSocket));
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1_500))]);
    }
  });

  await waitForOutput(server, `:${port}`);
  return {
    origin,
    url,
    connect: async () => {
      const socket = await connect(url, origin);
      sockets.add(socket);
      return socket;
    },
  };
}

test('private rooms require the invite capability and authorize room actions', async (t) => {
  const { origin, url, connect: openSocket } = await startTestServer(t);
  const health = await fetch(`${origin}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true }, 'health checks reveal no in-memory room details');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.match(health.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(health.headers.get('access-control-allow-origin'), null);

  const appResponse = await fetch(`${origin}/`);
  assert.ok([200, 503].includes(appResponse.status), 'the app is served when built and otherwise reports service unavailable');
  assert.match(appResponse.headers.get('content-security-policy'), /default-src 'self'/);
  await appResponse.text();
  const headResponse = await fetch(`${origin}/healthz`, { method: 'HEAD' });
  assert.equal(headResponse.status, 200, 'HEAD remains available for HTTP health checks');

  const methodResponse = await fetch(`${origin}/healthz`, { method: 'POST' });
  assert.equal(methodResponse.status, 405, 'the HTTP server rejects methods other than GET and HEAD');
  assert.equal(methodResponse.headers.get('allow'), 'GET, HEAD');

  assert.equal(await rejectedHandshakeStatus(url), 403, 'a missing Origin is rejected');
  assert.equal(await rejectedHandshakeStatus(url, 'https://attacker.example'), 403, 'an unrelated Origin is rejected');

  const host = await openSocket();
  const createdPromise = waitForRoomState(host, (message) => message.yourMark === 'X');
  send(host, { type: 'create_room', name: 'Host', token: 'host_identity_token_12345678901234567890' });
  const created = await createdPromise;
  const code = created.room.code;
  const inviteToken = created.inviteToken;
  assert.match(inviteToken, /^[a-zA-Z0-9_-]{22}$/, 'the server creates a high-entropy invite capability');
  assert.equal(created.room.status, 'waiting');
  assert.equal(created.room.players.O, null);
  assert.deepEqual(created.room.board, Array(9).fill(null));

  const waitingChatError = waitForRoomError(host);
  send(host, { type: 'chat', text: 'This must wait for a second player.' });
  assert.equal(await waitingChatError, 'Room chat opens when the second player joins.');
  assert.equal(created.room.messages.length, 0, 'chat is not accepted while the room is waiting');

  const guest = await openSocket();
  const missingInviteError = waitForRoomError(guest);
  send(guest, { type: 'join_room', code, name: 'Guest', token: 'guest_identity_token_12345678901234567890' });
  assert.equal(await missingInviteError, 'Invalid secure invite. Check the link or both invite values.');

  const invalidInviteError = waitForRoomError(guest);
  send(guest, { type: 'join_room', code, inviteToken: '0'.repeat(22), name: 'Guest', token: 'guest_identity_token_12345678901234567890' });
  assert.equal(await invalidInviteError, 'Invalid secure invite. Check the link or both invite values.');

  const unauthorizedActions = [
    [{ type: 'move', index: 0 }, 'Join a private room before making a move.'],
    [{ type: 'resume_room', code, token: 'unknown_identity_token_12345678901234567890' }, 'This browser is not a member of that room.'],
    [{ type: 'next_round_vote' }, 'Join a private room before starting another round.'],
    [{ type: 'chat', text: 'Not a room member.' }, 'Join a private room to chat.'],
  ];
  for (const [action, expectedError] of unauthorizedActions) {
    const errorPromise = waitForRoomError(guest);
    send(guest, action);
    assert.equal(await errorPromise, expectedError, `${action.type} requires an authorized room member`);
  }

  const hostJoinedPromise = waitForRoomState(host, (message) => message.room.status === 'playing' && message.room.players.O?.name === 'Guest');
  const guestJoinedPromise = waitForRoomState(guest, (message) => message.yourMark === 'O' && message.room.status === 'playing');
  send(guest, { type: 'join_room', code, inviteToken, name: 'Guest', token: 'guest_identity_token_12345678901234567890' });
  await Promise.all([hostJoinedPromise, guestJoinedPromise]);

  const wrongTurnError = waitForRoomError(guest);
  send(guest, { type: 'move', index: 0 });
  assert.equal(await wrongTurnError, 'It is the other player’s turn.');

  const hostChatPromise = waitForRoomState(host, (message) => message.room.messages.some((entry) => entry.text === 'Hello <friend>'));
  const guestChatPromise = waitForRoomState(guest, (message) => message.room.messages.some((entry) => entry.text === 'Hello <friend>'));
  send(guest, { type: 'chat', text: '  Hello <friend>  ' });
  const [hostChat, guestChat] = await Promise.all([hostChatPromise, guestChatPromise]);
  for (const chatState of [hostChat, guestChat]) {
    assert.equal(chatState.room.messages.at(-1).name, 'Guest');
    assert.equal(chatState.room.messages.at(-1).mark, 'O');
  }

  const guestFinishedPromise = waitForRoomState(guest, (message) => message.room.status === 'finished');
  const moves = [
    { socket: host, index: 0, mark: 'X' },
    { socket: guest, index: 3, mark: 'O' },
    { socket: host, index: 1, mark: 'X' },
    { socket: guest, index: 4, mark: 'O' },
    { socket: host, index: 2, mark: 'X' },
  ];
  for (const move of moves) {
    const statePromise = waitForRoomState(host, (message) => message.room.board[move.index] === move.mark);
    send(move.socket, { type: 'move', index: move.index });
    await statePromise;
  }

  const finished = await guestFinishedPromise;
  assert.equal(finished.room.scores.X, 1, 'both players receive the same updated scoreboard');

  const firstVotePromise = waitForRoomState(host, (message) => message.room.nextRoundVotes.X === true);
  send(host, { type: 'next_round_vote' });
  const firstVote = await firstVotePromise;
  assert.equal(firstVote.room.round, 1, 'one yes vote cannot start the next round');
  assert.equal(firstVote.room.status, 'finished');

  const hostNextPromise = waitForRoomState(host, (message) => message.room.round === 2 && message.room.status === 'playing');
  const guestNextPromise = waitForRoomState(guest, (message) => message.room.round === 2 && message.room.status === 'playing');
  send(guest, { type: 'next_round_vote' });
  const [hostNext, guestNext] = await Promise.all([hostNextPromise, guestNextPromise]);

  for (const nextState of [hostNext, guestNext]) {
    assert.equal(nextState.room.turn, 'O', 'the opening mark alternates on a rematch');
    assert.deepEqual(nextState.room.board, Array(9).fill(null));
    assert.deepEqual(nextState.room.nextRoundVotes, { X: false, O: false });
    assert.equal(nextState.room.scores.X, 1);
  }

  const flooder = await openSocket();
  const floodClosePromise = waitForClose(flooder);
  for (let index = 0; index < 61; index += 1) send(flooder, { type: 'unsupported_test_action' });
  const floodClose = await floodClosePromise;
  assert.equal(floodClose.code, 1008, 'a socket sending more than 60 messages in ten seconds is closed');
});
