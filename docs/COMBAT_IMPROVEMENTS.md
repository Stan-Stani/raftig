# Combat improvements — prioritized plan (v2)

> **Status (2026-07-16): implemented on this branch.** Everything below
> shipped as working code in the commits that follow the plan: the Phase 1
> legibility pass (damage numbers, hp bars, hit-flash, muzzle recoil, kill
> and scuttle feedback, low-hull alarm, the hold-fire teaching toast); Phase
> 2's frost diminishing returns and the anti-kite **press**, plus a venom
> rebalance the plan missed (playtesting showed toxin killed every gun and
> forced the scuttle jackpot — poison now wilts a plant to 1hp but never
> fells it, the killing blow must be shot in); Phase 4's `ward` point-defense
> gene; and the Phase 5 README/controls fixes. **Phase 3 (per-mount 🎯 range
> trim and A/D+Space broadside rails) shipped but was reverted per playtest
> feedback** — disliked in practice, so `elev`/Z-X stayed the only ranging
> knob and Space stayed an all-or-nothing volley. Still open: the dangling pity-floor
> comment in `game.ts` (breeding scope), and tuning passes on the new
> numbers (press trigger 5s/charge 8s, frost ×0.75 per stack, ward arc ±1
> rad) once they've been felt in real runs.

*Rewritten against the actual current tip (`b25dae2`, "Deep-water gunnery
actually threatens a moving player"). The first version of this doc was
mistakenly written against a 6-day-stale `main` (`f3b92e3`) and argued against
features — manual fire, mortars, homing/airburst — that have long since
shipped. Everything below reflects the game as it plays today. File:line refs
are against `b25dae2`.*

## Where combat stands now

The combat frame has committed, hard and successfully, to **manual mortar
gunnery as the skill expression**:

- Plants are mortars in fixed mounts; shells burst exactly at the bred reach
  ring (`fireVolley`, `game.ts:1391-1433`). **Space** fires a ship-wide volley
  of every loaded gun (`game.ts:1217-1223`); each gun then reloads on its rate
  gene (amber gauge, `render.ts:466-484`).
- **Z/X battery elevation** scales every burst ring between 50-100% of bred
  reach (`game.ts:1153-1158`, ring = `pheno.range × elev`).
- Moment-to-moment skill is three-axis: steer the fixed bearings on target,
  crank elevation to match range, time the volley — while slipping the
  enemies' red drop rings.
- The enemy roster is genuinely varied — **7 kinds with distinct doctrines**
  (`game.ts:257`, spawn table `game.ts:1494-1504`): raider (plain hunter),
  harrier (oar sprinter), sloop (kiter/sniper), fireship (armored kamikaze),
  mortar barge (ranges you in), galleon (heavy tank), bastion (immovable hive
  garrison).
- Plain hunters now **lead a moving target** off a stale lookout picture with
  an eased lead direction (`game.ts:2009-2064`), surge/retreat on a 9 s cycle
  (`game.ts:2128-2133`), and get drilled crews + faster shells in deep water.
- Genetics: 8 loci with real tradeoffs (heavier ball → slower cycle, longer
  glass → lighter ball, `genetics.ts:238-271`), **homing** quirk and the
  **airburst** locus are shipped and region-locked; enemy guns run the same
  volley machinery, so deep-water raiders use them against you.

The mismatch that defines this plan: **combat has grown mechanically deep
while staying visually illegible and defensively one-dimensional.** The recent
juice budget (wake, foam, camera) went to the sea, not the fight. A titan hit
(13) and a mild hit (4) still look identical; enemy HP is readable only via a
hover tooltip; and the only defense is the helm.

---

## Phase 1 — Make the fight legible. Small, zero design risk, do first.

The genetics payoff — the whole point of breeding — is invisible at the moment
it pays off. Every item here is independently shippable.

### 1.1 Damage numbers
Float the damage on every shell/burst hit. `toastAt` exists
(`game.ts:2814-2816`) but is reserved for pickups/status — add a compact
variant (smaller, ~0.6 s, slight random drift so hydra volleys don't stack).
Color by element (ember amber, frost cyan, venom green, plain white); scale
size with damage so titan visibly thumps. Aggregate DoT ticks to ~1/s.

- Hook points: the hull/plant damage applications in `shellBurst`
  (`game.ts:2348-2366`) and the player-side hits (`game.ts:2418-2435`).
- Acceptance: volley a mild gun and a titan gun at the same raider — the
  difference must be obvious from numbers alone, tooltip never opened.

### 1.2 HP bars
- Thin hull bar over any enemy that is damaged **and** noticed/hunting (hide
  full-HP roamers; keep the horizon clean). Sprite darkening
  (`render.ts:538-574`) stays the glance read; the bar is the precise read
  currently trapped in the hover tooltip (`render.ts:1757-1802`).
- Plants already have the petal gauge (`render.ts:421-464`) — good; leave it.
- Player hull: keep the HUD chip; add an over-ship bar only below ~50%.

### 1.3 Hit-flash and kill feedback
- 60-80 ms white flash on any hull taking a hit (add a `flashT` field, decay
  in the fx update at `game.ts:1058`, tint in `drawHull`). None exists today.
- Muzzle recoil: nudge the plant sprite ~2 px along -aim on fire
  (`game.ts:1376-1385`).
- **Give gun kills a sound**: `killEnemyGun` (`game.ts:2266-2281`) is silent
  but for a green burst — wire the `'break'` SFX (`audio.ts:62`, currently
  only used for seed deletion on the breeding board, `game.ts:2718`).
- **Scuttle is the jackpot and reads like any kill**: `checkScuttle`
  (`game.ts:2259-2264`) routes to the standard `sinkShip` fanfare. Give it a
  distinct bigger burst + fanfare + toast.

### 1.4 Low-hull alarm
Below 25% hull: red edge vignette + slow heartbeat SFX on top of the existing
`⚠` chip (`render.ts:1315-1317`). Deaths stop feeling sudden.

### 1.5 Signpost hold-fire
With manual fire, holding fire is already the stealth verb — but it's
emergent and unsignposted. When a hostile is in `notice`/`hunt` range and no
volley has fired, surface it ("guns silent — they haven't marked you" style
hint, once per encounter), and document it in the README. Zero mechanics
change; pure teaching.

---

## Phase 2 — Close the degenerate loops (balance)

### 2.1 Frost diminishing returns
`chillT` is set to a flat 2.5 s on **every** application with no falloff
(`game.ts:2351`, `2366`, `2384`, `2421`; player-side `game.ts:690`). A frost
broadside chains ×1.5 enemy reload + ×0.5 speed indefinitely — a permanent
stunlock. Add per-ship frost buildup: each application refreshes less
(effective duration ×0.75 per stack, floor 0.5 s), full susceptibility
returning ~6 s after the last hit. Frost stays premium control without being
a lock.

### 2.2 Shallow-water anti-kite
The deep-water lethality work (lead + drill + faster shells) counters kiting
**only at high danger**. In home/mid waters, `enemyReach`
(`game.ts:1342-1349`) deliberately pulls enemy guns to 90% of *your* reach —
so spyglass + back-water kiting is still a near-zero-damage win wherever the
anti-kite kinds (mortar barge d>3.5, fireship d>2.5) don't spawn.

Fix behaviorally, not with reach buffs: an engaged hunter that has taken hits
for ~5 s without once achieving a firing solution enters **press** — abandons
its surge station and closes flat-out to well inside its own ring, accepting
rake damage to force a knife fight. Telegraph it (pennant flare + toast) so
the helm can answer. Kiting keeps buying time and chip damage; it stops being
a free win at danger 1-3.

- Acceptance: a spyglass skiff at max ring vs a lone home-waters raider can no
  longer take zero damage; it must finish the kill before press closes, or
  disengage.

### 2.3 Leave alone (deliberately)
- **Patience renewing on any hit** (`game.ts:2348`, `2363`, `2418`, `2435`) —
  stated design: a fight holds them, a clean run sheds them.
- **Symmetric out-of-combat regen + no-reinforcement rule**
  (`game.ts:1875-1883`, `2602-2622`) — commit-or-flee is the intended shape.
- **Bastion neutrality** letting you farm hive-vs-raider fights from outside
  800 px (`game.ts:1965-1996`) — it's clever play, not an exploit; the bees
  keep the salvage (`bee`-tainted shells spoil it) so the payoff already
  self-limits. Revisit only if it proves dominant.

---

## Phase 3 — Fire control depth: make mixed decks real

The README pitch — short brawlers at the rail, spyglass snipers standing off —
is undercut by two all-or-nothing controls:

### 3.1 Per-mount elevation trim
`elev` is a single ship-wide scalar (`game.ts:485`): Z/X compromises every
ring at once, so a mixed short+spyglass deck can't range both. Add a
per-mount **trim** set on deck out of combat (the same interaction slot the
removed 🎯 aim tool used to occupy): click a plant, drag its ring to a
preferred fraction. Z/X stays as the live global multiplier on top — combat
keeps one knob, the build gains per-gun identity.

### 3.2 Broadside groups
Space dumps every loaded gun (`game.ts:1217-1223`). Add hold-to-select
volleys: **Space = all**, **A+Space / D+Space = port/starboard battery only**
(or bow/stern chasers with W/S — pick one pairing and playtest). This is a
decision, not a dexterity test: it enables holding one broadside loaded while
the other fires, and rationing water on a thirsty deck.

- Acceptance: on a brig with a spyglass bow chaser + short broadside, a
  player can snipe with the chaser while the broadside stays loaded for the
  close — impossible today.

---

## Phase 4 — Defense enters through the genome

Still **zero** defensive options beyond steering and Z/X; damage taken is
purely "did a red ring cross the hull." Solve it the raftig way — breed it:

### 4.1 `ward` quirk — point-defense
New rare recessive **quirk** allele (`genetics.ts:66-98` pattern, one per
plant): a ward plant doesn't bombard — it detonates **incoming enemy shells**
that pass through its ring annulus, at a water cost per intercept. A mount
slot sacrificed for safety is a real build decision on a 2-6 mount ship, and
coverage is positional (the ward's fixed bearing + elevation is an arc you
steer, like every other gun). Region-lock it deep like homing/airburst
(`genetics.ts:100-150`), so it's a hunted gene, not a default.

- Implementation: in the enemy-shell update, test shells against ward rings
  (same `SPLASH`-style tolerance, `game.ts:48`); intercept = mid-air burst +
  `'break'` SFX. Ward obeys reload — rapid-gene wards intercept more often.
- Watch the interaction with 2.2's press: ward should soften a press charge,
  not nullify it (intercept chance/reload tuning, not guarantees).

### 4.2 Not doing: armor items, evasion stats, resist gear
No new item systems. If ward proves the frame, a second defensive allele
(e.g. a `bulwark` thirst-tier that hardens the plant itself) can follow — but
defense stays in the genome.

---

## Phase 5 — Docs and small hygiene

- **README drift**: Controls section (`README.md:111-116`) omits Z/X
  entirely; genetics table (`README.md:82-94`) is missing the `burst`/airburst
  locus and the homing quirk. Update both — the README is the design contract.
- `game.ts:433` comments a pity-floor counter ("crosses in a row that
  surfaced no rare") whose field doesn't appear to be declared — verify when
  next touching breeding.
- Local `main` is stale at `f3b92e3`; `origin/main` is `b25dae2`
  (`breeding-genes-ports`). Fast-forward local main to stop this doc's
  mistake from recurring.

---

## Suggested order & sizing

| # | Item | Size | Why this order |
|---|------|------|----------------|
| 1 | 1.1-1.4 legibility pass | S | Makes every later change tunable by feel; biggest open gap |
| 2 | 2.1 frost DR | S | One-file fix for the worst lock |
| 3 | 1.5 + Phase 5 docs | S | Teaching + contract hygiene |
| 4 | 2.2 press | M | Closes shallow-water kiting behaviorally |
| 5 | 3.1 elevation trim | M | Unlocks mixed-deck builds the game already sells |
| 6 | 3.2 broadside groups | M | Volley decisions; playtest key pairing |
| 7 | 4.1 ward | M | First defensive gene; hunted, positional, on-theme |

Each item ships with a play-check — the acceptance notes in 1.1, 2.2, and 3.2
are the template: a concrete before/after scenario verifiable in one sail.
