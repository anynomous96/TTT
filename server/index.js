import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { getOutcome } from '../src/game/logic.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const distDirectory = resolve(here, '../dist');
const port = Number(process.env.PORT) || 3001;
const rooms = new Map();
const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CHAT_LENGTH = 300;
const MAX_CHAT_MESSAGES = 60;
const CHAT_WINDOW_MS = 10_000;
const MAX_CHAT_PER_WINDOW = 8;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendError(socket, message) {
  send(socket, { type: 'error', message });
}

function cleanName(value) {
  if (typeof value !== 'string') return 'Player';
  const name = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18);
  return name || 'Player';
}

function cleanToken(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function cleanRoomCode(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => ROOM_CODE_CHARACTERS[randomInt(ROOM_CODE_CHARACTERS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    board: [...room.board],
    turn: room.turn,
    status: room.status,
    winner: room.winner,
    winningLine: [...room.winningLine],
    round: room.round,
    scores: { ...room.scores },
    players: {
      X: room.players.X ? { name: room.players.X.name, online: room.players.X.online } : null,
      O: room.players.O ? { name: room.players.O.name, online: room.players.O.online } : null,
    },
    messages: room.messages.map((message) => ({ ...message })),
  };
}

function sendRoomState(room) {
  const state = publicRoom(room);
  for (const mark of ['X', 'O']) {
    const player = room.players[mark];
    if (player?.socket && player.socket.readyState === WebSocket.OPEN) {
      send(player.socket, { type: 'room_state', room: state, yourMark: mark });
    }
  }
}

function getRoomForSocket(socket) {
  const room = rooms.get(socket.roomCode);
  if (!room || !socket.role) return null;
  const player = room.players[socket.role];
  if (!player || player.socket !== socket) return null;
  return room;
}

function attachPlayer(socket, room, mark, token, name) {
  const player = room.players[mark];
  const previousSocket = player?.socket;
  room.players[mark] = {
    token,
    name: cleanName(name || player?.name || 'Player'),
    online: true,
    socket,
  };
  socket.roomCode = room.code;
  socket.role = mark;
  socket.playerToken = token;
  socket.chatTimes = [];
  room.lastActivity = Date.now();

  // Replace a stale tab without letting its close event mark this one offline.
  if (previousSocket && previousSocket !== socket && previousSocket.readyState !== WebSocket.CLOSED) {
    previousSocket.close(4001, 'This room was opened in another tab');
  }
}

function createRoom(socket, payload) {
  const token = cleanToken(payload.token);
  if (!token) return sendError(socket, 'Please refresh the page and try again.');

  const code = makeRoomCode();
  const room = {
    code,
    board: Array(9).fill(null),
    turn: 'X',
    status: 'waiting',
    winner: null,
    winningLine: [],
    round: 1,
    scores: { X: 0, O: 0, draws: 0 },
    players: { X: null, O: null },
    messages: [],
    lastActivity: Date.now(),
  };
  rooms.set(code, room);
  attachPlayer(socket, room, 'X', token, payload.name);
  sendRoomState(room);
}

function joinRoom(socket, payload, isResume = false) {
  const code = cleanRoomCode(payload.code);
  const token = cleanToken(payload.token);
  const room = rooms.get(code);
  if (!room) return sendError(socket, 'That room could not be found. Check the code and try again.');
  if (!token) return sendError(socket, 'Please refresh the page and try again.');

  let mark = ['X', 'O'].find((candidate) => room.players[candidate]?.token === token);
  if (isResume && !mark) {
    return sendError(socket, 'This browser is not a member of that room. Rejoin with the room code.');
  }

  if (!mark) {
    if (room.players.O) return sendError(socket, 'This room already has two players. Ask the host for a new room.');
    mark = 'O';
  }

  attachPlayer(socket, room, mark, token, payload.name);
  if (room.players.X && room.players.O && room.status === 'waiting') {
    room.status = 'playing';
  }
  room.lastActivity = Date.now();
  sendRoomState(room);
}

function playMove(socket, payload) {
  const room = getRoomForSocket(socket);
  if (!room) return sendError(socket, 'Join a private room before making a move.');
  const index = payload.index;
  if (!Number.isInteger(index) || index < 0 || index > 8) return sendError(socket, 'That square is not available.');
  if (room.status !== 'playing') return sendError(socket, 'The room is not in an active round yet.');
  if (room.turn !== socket.role) return sendError(socket, 'It is the other player’s turn.');
  if (room.board[index] !== null) return sendError(socket, 'That square has already been played.');

  room.board[index] = socket.role;
  const outcome = getOutcome(room.board);
  if (outcome.winner) {
    room.status = 'finished';
    room.winner = outcome.winner;
    room.winningLine = outcome.winningLine;
    room.scores[outcome.winner] += 1;
  } else if (outcome.draw) {
    room.status = 'finished';
    room.winner = null;
    room.winningLine = [];
    room.scores.draws += 1;
  } else {
    room.turn = socket.role === 'X' ? 'O' : 'X';
  }
  room.lastActivity = Date.now();
  sendRoomState(room);
}

function startNextRound(socket) {
  const room = getRoomForSocket(socket);
  if (!room) return sendError(socket, 'Join a private room before starting another round.');
  if (room.status !== 'finished') return sendError(socket, 'Finish this round before starting the next one.');
  if (!room.players.X?.online || !room.players.O?.online) {
    return sendError(socket, 'Both players need to be in the room before the next round can start.');
  }

  room.round += 1;
  room.board = Array(9).fill(null);
  room.winner = null;
  room.winningLine = [];
  room.turn = room.round % 2 === 0 ? 'O' : 'X';
  room.status = 'playing';
  room.lastActivity = Date.now();
  sendRoomState(room);
}

function postChat(socket, payload) {
  const room = getRoomForSocket(socket);
  if (!room) return sendError(socket, 'Join a private room to chat.');
  const text = typeof payload.text === 'string'
    ? payload.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT_LENGTH)
    : '';
  if (!text) return;

  const now = Date.now();
  socket.chatTimes = (socket.chatTimes || []).filter((timestamp) => now - timestamp < CHAT_WINDOW_MS);
  if (socket.chatTimes.length >= MAX_CHAT_PER_WINDOW) {
    return sendError(socket, 'You’re sending messages a little too quickly. Try again in a moment.');
  }
  socket.chatTimes.push(now);

  room.messages.push({
    id: randomUUID(),
    mark: socket.role,
    name: room.players[socket.role].name,
    text,
    sentAt: new Date(now).toISOString(),
  });
  if (room.messages.length > MAX_CHAT_MESSAGES) room.messages.splice(0, room.messages.length - MAX_CHAT_MESSAGES);
  room.lastActivity = now;
  sendRoomState(room);
}

function handleMessage(socket, raw) {
  let payload;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    return sendError(socket, 'That message could not be read.');
  }
  if (!payload || typeof payload.type !== 'string') return sendError(socket, 'That message could not be read.');

  switch (payload.type) {
    case 'create_room':
      createRoom(socket, payload);
      break;
    case 'join_room':
      joinRoom(socket, payload);
      break;
    case 'resume_room':
      joinRoom(socket, payload, true);
      break;
    case 'move':
      playMove(socket, payload);
      break;
    case 'new_round':
      startNextRound(socket);
      break;
    case 'chat':
      postChat(socket, payload);
      break;
    default:
      sendError(socket, 'That action is not supported.');
  }
}

function serveStatic(request, response) {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  if (!existsSync(join(distDirectory, 'index.html'))) {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Threefold is ready. Run `npm run dev` for the development app or `npm run build` before `npm start`.');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  const safePath = normalize(pathname).replace(/^([.][.][/\\])+/, '');
  let filePath = resolve(distDirectory, `.${safePath}`);
  if (!filePath.startsWith(`${distDirectory}${sep}`) && filePath !== distDirectory) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
  if (!existsSync(filePath) || !statSync(filePath).isFile()) filePath = join(distDirectory, 'index.html');

  try {
    const contents = readFileSync(filePath);
    const isHtml = extname(filePath) === '.html';
    response.writeHead(200, {
      'content-type': contentTypes[extname(filePath)] || 'application/octet-stream',
      'cache-control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
    response.end(contents);
  } catch {
    response.writeHead(500);
    response.end('Unable to load this file.');
  }
}

const server = createServer(serveStatic);
const webSocketServer = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

webSocketServer.on('connection', (socket) => {
  socket.isAlive = true;
  socket.chatTimes = [];
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', (raw) => handleMessage(socket, raw));
  socket.on('error', (error) => console.error('WebSocket error:', error.message));
  socket.on('close', () => {
    const room = rooms.get(socket.roomCode);
    const player = room?.players[socket.role];
    if (player?.socket === socket) {
      player.socket = null;
      player.online = false;
      room.lastActivity = Date.now();
      sendRoomState(room);
    }
  });
});

const heartbeat = setInterval(() => {
  for (const socket of webSocketServer.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30_000);

const roomCleanup = setInterval(() => {
  const expiry = Date.now() - 12 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.lastActivity < expiry) rooms.delete(code);
  }
}, 30 * 60 * 1000);

server.listen(port, '0.0.0.0', () => {
  console.log(`Threefold server listening on http://0.0.0.0:${port}`);
});

function shutdown() {
  clearInterval(heartbeat);
  clearInterval(roomCleanup);
  for (const socket of webSocketServer.clients) socket.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
