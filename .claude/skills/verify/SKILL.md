---
name: verify
description: Build, launch, and drive raftig to verify changes end-to-end in a real browser.
---

# Verifying raftig

Canvas game, no tests — verification is driving the running game.

## Build & launch

```sh
npm run build                      # tsc + vite build (type gate)
npx vite --port 5199 --strictPort  # dev server, HMR reloads the page on edit
```

Open `http://localhost:5199/` with the chrome-devtools MCP tools
(`new_page`, `take_screenshot`, `evaluate_script`, `press_key`).

## Driving the game

`window.__game` is the live `Game` instance (set in `main.ts`). Useful moves:

- `g.helpOpen = false` — the help overlay blocks `update()`; close it first.
- Teleport: `g.raft.pos.x = …` (tiles/plants are raft-relative and follow).
- TS `private` methods are callable at runtime: `g.destroyEnemyTile(e, t)`,
  `g.spawnEnemyRaft({at, kind, home})`, `g.aggro(e)`.
- POIs materialize lazily around the player — hop the raft ~2000px at a time
  (with ~100ms waits) until the kind you need appears in `g.pois`.
- Real input paths: `press_key` reaches the window keydown listener
  (e.g. `t` → trade); clicks go through `game.click`.
- `g.reset()` regenerates the whole world (POIs included).

## Gotchas

- Every source edit triggers a full page reload via HMR — re-grab state and
  re-close the help overlay after each edit.
- Leaving the raft unattended in dangerous waters gets it shot and plants
  wilt unwatered; clear `g.enemies = []` while staging scenes.
- Check `list_console_messages` (error/warn) at the end — the game logs
  nothing in normal operation, so anything there is real.
