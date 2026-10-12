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
npm test       # game logic, perfect play, forced draws, and private-room security/rematches
npm run build  # optimized production bundle
npm start      # serves the production bundle + WebSocket endpoint on PORT (default 3001)
```

## Play modes

- **Vs computer:** minimax searches the full game tree. It will take a win when offered and never lose; perfect human play ends in a draw. X or O can be selected. If no winning continuation remains, the app completes the forced draw.
- **Same device:** pass the screen between two players, rename them, keep a match score, and rematch. A new match starts at zero; per-device all-time records are separate.
- **Private room:** create a six-character room ID and a separate, unguessable invite capability, or open a friend's secure invite link. The room ID alone cannot authorize a join. Live room state, alternating turns, match scores, reconnects, and plain-text chat are synchronized over WebSockets. The host sees a waiting/invite lobby until the guest joins; both players must agree before a rematch starts.

Private-room data and the last 60 chat messages are held in server memory. Rooms expire after 12 hours of inactivity and are removed when the server restarts. Private rooms are not public matchmaking.

## Private-room protections and limits

- Each room invite uses a cryptographically generated 128-bit capability in addition to the six-character room ID. Copied links carry the capability in the URL fragment; the browser sends both values during the WebSocket join. A manually entered room ID without the private key is rejected. The server compares invite capabilities in constant time.
- A separate high-entropy browser identity is used to associate an already-joined player with their socket when reconnecting. Moves, chat, and rematch votes are accepted only from a socket attached to a room member; moves must also follow the current turn. Chat is rejected until both player slots are occupied.
- The WebSocket handshake requires an `Origin` that matches the request host or an exact origin listed in the comma-separated `ALLOWED_ORIGINS` environment variable. When using a reverse proxy, configure that list for the public app origin and preserve or validate the public `Host` header.
- The server caps active rooms at 500 and WebSocket clients at 250, limits each socket to 60 messages per 10 seconds and up to 8 create attempts and 8 join attempts per minute, and limits chat to 8 messages per 10 seconds, 300 characters per message, and 60 stored messages per room. WebSocket payloads are capped at 16 KiB.
- HTTP serves only `GET` and `HEAD`, applies request/header timeouts, and `/healthz` returns only a simple health result. Responses include a restrictive content-security policy and common browser security headers.

These measures reduce common unauthorized access, cross-site WebSocket, and resource-abuse risks; they are not a claim of absolute security. There are no user accounts or end-to-end encrypted messages: the room server can read room state and chat. Treat invite links and the displayed private key as bearer secrets—anyone who receives one may claim the open guest seat. For production, serve the app over HTTPS and the socket over WSS, and configure the allowed public origin when deploying behind a proxy.

## Deployment note

The app needs a **persistent Node.js process that supports WebSockets** for private rooms. Build with `npm run build` and run `npm start` on a Node host (for example, a container or persistent application service). A static-only deployment or serverless function host such as a default Vercel deployment cannot run this in-memory WebSocket room server; host the socket server separately and proxy `/ws` to it if keeping a static frontend deployment. In that setup, set `ALLOWED_ORIGINS` to the frontend's exact origin.
