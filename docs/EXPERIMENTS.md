# Experiments

Approaches that were tried and dropped. They are kept because the reasoning is
worth more than the code, and because two of them may come back.

- **`session.js`** holds a real SquadCalc shared session through a headless
  browser. Dropped when server-side composition removed the browser entirely,
  but it is the only route that carries other members' pings into the image.
- **`ws-test.mjs`** joins a session over a plain WebSocket, no browser. It
  proves the session protocol is reachable from Node alone.

Neither is wired into the bot.
