# Threefold — Tic Tac Toe, your way

A polished, responsive tic tac toe app with an unbeatable computer opponent, same-device pass-and-play, and private two-player rooms with live chat.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually `http://localhost:5173`). The dev command starts the Vite app and the WebSocket room server together.

```bash
npm test       # rules and exhaustive perfect-play checks
npm run build  # optimized production bundle
npm start      # serves the production bundle + WebSocket endpoint on PORT (default 3001)
```

## Play modes

- **Vs computer:** minimax searches the full game tree. It will take a win when offered and never lose; perfect human play ends in a draw. X or O can be selected.
- **Same device:** pass the screen between two players, rename them, keep a round score, and rematch.
- **Private room:** create a six-character invite code or join a friend. Room state, alternating turns, win/draw totals, reconnects, and plain-text chat are synchronized over WebSockets. Invite links prefill the room code.

Per-device records are stored in browser local storage. Private rooms, their scorecards, and the last 60 chat messages are held in server memory and are removed after 12 hours of inactivity or when the server restarts. Private rooms are code-based, not public matchmaking.

## Deployment note

The app needs a **persistent Node.js process that supports WebSockets** for private rooms. Build with `npm run build` and run `npm start` on a Node host (for example, a container or persistent application service). A static-only deployment or serverless function host such as a default Vercel deployment cannot run this in-memory WebSocket room server; host the socket server separately and proxy `/ws` to it if keeping a static frontend deployment.
