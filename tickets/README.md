# raftig community ticket board

A tiny, no-login feedback board: anyone can suggest a bug/feature/balance
change and vote on existing ones. No accounts — submissions and votes are
rate-limited per IP (hashed with a server-side salt, never stored raw)
instead of gated behind a login. Good enough for a v1; revisit if abused.

## Run

```
npm ci
PORT=8795 IP_SALT=<random secret> node server.js
```

`ideas.html` is a static page meant to be served directly by the front-end
web server (not by this Node process) — it fetches `/api/tickets` on the
same origin. In production, only `/api/tickets*` is proxied to this
service; everything else (including `ideas.html`) is served as static
files.

## Data

SQLite (`tickets.db`, gitignored) — three tables: `tickets`, `votes`
(one row per ticket+IP-hash, enforces one vote per person per ticket),
`submissions` (drives the per-IP rate limit on new tickets).
