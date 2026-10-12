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

function connect(url) {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve(socket));
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

test('private room state syncs and a rematch waits for both players', async (t) => {
  const port = await unusedPort();
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let host;
  let guest;

  t.after(async () => {
    await Promise.all([closeSocket(host), closeSocket(guest)]);
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 1_500))]);
    }
  });

  await waitForOutput(server, `:${port}`);
  host = await connect(`ws://127.0.0.1:${port}/ws`);
  const createdPromise = waitForRoomState(host, (message) => message.yourMark === 'X');
  send(host, { type: 'create_room', name: 'Host', token: 'host_test_token_1234567890' });
  const created = await createdPromise;
  const code = created.room.code;

  guest = await connect(`ws://127.0.0.1:${port}/ws`);
  const hostJoinedPromise = waitForRoomState(host, (message) => message.room.status === 'playing' && message.room.players.O?.name === 'Guest');
  const guestJoinedPromise = waitForRoomState(guest, (message) => message.yourMark === 'O' && message.room.status === 'playing');
  send(guest, { type: 'join_room', code, name: 'Guest', token: 'guest_test_token_1234567890' });
  await Promise.all([hostJoinedPromise, guestJoinedPromise]);

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
});
