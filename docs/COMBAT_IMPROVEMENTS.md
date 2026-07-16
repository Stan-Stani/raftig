# Combat improvements — prioritized plan

*Companion to `BREEDING_REDESIGN.md`. Grounded in a full read of the shipped
combat system on `main` (HEAD `f3b92e3`, the reach-locus commit). File:line
references below are against that commit.*

## Where combat stands

The frame is strong and distinctive: **plants are fixed gun mounts, so the helm
is the trigger**. Firing is automatic (`updateShip`, `game.ts:736-743`); the
player's entire moment-to-moment skill is bringing broadsides to bear while
staying off the raiders' red firing lines. Enemy AI already has real texture —
staged aggro, chase patience, attack slots, oar fatigue.

Three pillars fall out of the existing design and the breeding research doc,
and every item below is filtered through them:

1. **The helm is the weapon.** Depth comes from positioning, never from a
   trigger or a timing bar. (Manual fire was prototyped on the
   `worktree-mortar-manual-fire` branch and is a **rejected direction** — the
   research doc is blunt that twitch loops become chores.)
2. **Guns are genes.** New combat behaviors should be alleles you breed, not
   items or a second UI.
3. **Decisions, not reflexes.** New player inputs are allowed only if they are
   stances/choices, not dexterity.

The gaps, in order of how much they hurt:

- **The player can't *feel* the genetics.** A titan hit (13 dmg) and a mild hit
  (4 dmg) look identical: same puff, same shake. No damage numbers, no HP bars,
  no hit-flash. The entire breeding payoff is invisible in the fight it was
  bred for.
- **Two degenerate strategies**: spyglass outrange-kiting takes near-zero
  damage, and frost stacks into a permanent lock.
- **Two enemy kinds** (raider, harrier) — "pods" and "nests" are spawn
  groupings of the same entity, so every fight is the same fight with bigger
  numbers.
- **Zero defensive options** beyond steering; damage taken is purely whether a
  red line crosses the hull.
- **Zero combat inputs** at all — not even a hold-fire order, so you can't
  sneak past a pod, conserve water, or time a broadside.

---

## Phase 1 — Make hits legible (juice). Small, zero design risk, do first.

Everything here is independently shippable and makes every later balance change
tunable-by-feel instead of by spreadsheet.

### 1.1 Damage numbers
On every hull/plant hit, float the damage dealt (`toastAt` machinery already
exists, `game.ts:1590` + `render.ts:59-68` — add a compact variant: smaller,
shorter-lived, slight random drift so volleys don't stack). Color by element
(ember amber, frost cyan, venom green, plain white); scale font with damage so
titan visibly *thumps*. Show DoT ticks aggregated (~1/s), not per-tick.

- Hook points: `friendlyHit` (`game.ts:1251-1295`), `enemyHit`
  (`game.ts:1298-1326`).
- Acceptance: fire a mild plant and a titan plant at the same raider — the
  difference should be obvious from the numbers alone with tooltips never
  opened.

### 1.2 HP bars
- Thin hull bar over any enemy that is damaged **and** noticed/hunting (hide on
  full-HP roamers to keep the horizon clean). Sprite-darkening
  (`render.ts:284-297`) stays as the at-a-glance read; the bar is the precise
  read currently locked in the hover tooltip (`render.ts:1108`).
- Plant HP: small pip/sliver on the existing water-bar widget
  (`render.ts:241-251`) only when the plant is damaged.
- Player hull: keep the HUD chip, add a bar over the ship only below ~50%.

### 1.3 Hit-flash and kill feedback
- 60–80 ms white flash on any hull/plant taking a hit (a `flashT` field decayed
  in `updateFx`, `game.ts:607`; tint in the sprite draw).
- Muzzle nudge: recoil the plant sprite ~2 px along -aim on fire
  (`firePlant`, `game.ts:769-792`).
- **Wire up the dead `'break'` SFX** (`audio.ts:62`, defined but never called)
  for plant/gun kills; give scuttle (`checkScuttle`, `game.ts:1206-1211`) a
  distinct, bigger fanfare + burst than a regular gun kill — it's the jackpot
  moment and currently reads like any other kill.

### 1.4 Low-hull alarm
Below 25% hull: red edge vignette + slow heartbeat SFX + the existing ⚠ chip.
Cheap, and deaths stop feeling sudden.

### 1.5 Hold-fire stance (the one new input)
One key (e.g. **F**) toggles ship-wide *hold fire / weapons free*. While held,
plants don't auto-fire (and don't drink combat water). This is a **decision,
not a trigger** — consistent with pillar 3 — and it unlocks real play:

- sneak past a pod without waking it (aggro is proximity-based, but a stray
  volley currently commits you);
- conserve water when you'd rather flee;
- **alpha-strike**: hold while you close, release as the full broadside bears.

Implementation: a `holdFire` flag gating the auto-fire check at
`game.ts:736-743`; HUD chip + plant range rings dimmed while holding.
Edge case to decide: holding fire while hunted means only *their* hits renew
chase patience (`game.ts:25`, resets at `game.ts:1304`, `1315`) — that's
correct and makes hold-fire the natural "stop trading shots and shed them"
verb the README already teaches.

---

## Phase 2 — Close the degenerate strategies (balance)

### 2.1 Anti-kite: pressing behavior, not stat nerfs
Spyglass (420) outranges every raider gun; back-water kiting takes near-zero
damage because raiders politely hold standoff distance (240 px,
`game.ts:973`) and maneuver their fixed lines on (`game.ts:983-1011`).

Fix behaviorally: an engaged ship that has taken hits for ~5 s without once
achieving a firing solution enters **press** — abandons standoff, sails
straight in to well inside its own gun range, accepting rake damage to force a
knife fight. Telegraph it (pennant flares / `⚔️!` toast) so the player reads
the mode change and can respond with the helm. Kiting stays viable — it's good
sailing — but it now buys *time and chip damage*, not a free win.

- Keep `CHASE_PATIENCE` renewing on any hit (`game.ts:1260`) — that's a
  deliberate "a fight holds them" rule per the README; press handles the abuse
  case without touching it.
- Acceptance: a spyglass skiff sitting at 400 px can no longer zero-damage a
  lone raider; it must either finish the kill before press closes the gap or
  disengage.

### 2.2 Frost diminishing returns
`chillT` reapplies unbounded (`game.ts:1261-1264`), and the ×1.5 fire-rate /
×0.5 speed penalties (`game.ts:1113`, `941`) make one frost broadside a
permanent lock. Add per-ship frost buildup: each application refreshes less
(e.g. effective chill duration ×0.75 per stack, floor 0.5 s), decaying to full
susceptibility ~6 s after last application. Frost stays a strong control
element without being a stunlock.

### 2.3 Leave the regen/flee economy alone (for now)
Symmetric out-of-combat regen (`game.ts:688-691`, `1049-1063`) plus the
no-reinforcement rule (`game.ts:1463`) means broken-off fights fully reset.
That's *stated design* ("crews patch their hulls while you run — flee and the
loot sails off with them") and it cleanly enforces commit-or-flee. Revisit only
if Phase 3 enemies make mid-fight retreats too punishing.

---

## Phase 3 — Enemy variety: new behaviors, not bigger numbers

Only two kinds exist (`game.ts:160`); everything else is spawn grouping. Add
enemies that attack the *player's positioning skill* differently. Two first:

### 3.1 Fire-ship (rammer)
Small, fast, cheap hull that sprints to collide; on impact, hull damage +
ember ignite, and it sinks itself. Counters standing still and rewards clean
helm work; dies fast to a raked broadside on approach. Mostly reuses harrier
movement (`game.ts:867`, oar model `game.ts:938-940`) with a ram-course
steering mode and an `onHull` (`game.ts:387-393`) collision check.

### 3.2 Mortar barge (and the right way to recycle the dead branch)
Slow, long-range ship lobbing **telegraphed splash shells**: a splash ring
appears at the target point ~1.5 s before impact; the shell arcs in and
damages anything inside. This is the second anti-kite tool — it punishes
sitting still at range but is trivially dodged by a moving ship, so it *feeds*
the helm-is-the-weapon loop instead of fighting it.

The unmerged `worktree-mortar-manual-fire` branch already contains working
mortar ballistics (`firePlant`/`spawnShot` burst-at-distance in its
`game.ts:807-874`). **Salvage the ballistics for this enemy; do not merge the
branch** — manual fire and the wand rig are the rejected parts, the arc math is
fine.

### 3.3 Later candidates (park these)
- **Armored hulk**: shielded prow, guns astern — a pure get-behind-it puzzle.
- **Tender**: repairs podmates from the back line — creates a priority-target
  decision inside the attack-slot system.
- **Nest defenses**: the totem (currently inert, `game.ts:541-549`) gets a
  harpoon net that slows ships inside the tether radius — makes nest assaults
  feel like sieges instead of pod fights at a fixed address.

Spawn weighting: fold new kinds into `spawnEnemyShip`'s danger roll
(`game.ts:827-881`) the way harriers gate today (`game.ts:838`) — fire-ships
from danger ≳ 2, barges ≳ 3, so the open sea teaches one lesson at a time.

---

## Phase 4 — Genetics-driven combat depth (align with BREEDING_REDESIGN §1)

Do these together with (or immediately after) the breeding doc's step 1 — they
are the same work item seen from the combat side.

### 4.1 Homing + airburst alleles
Exactly as specified in `BREEDING_REDESIGN.md` §1: `home` as a new rare
recessive quirk (curves shots toward the nearest raider — finally a reason
rate/barrel builds don't strictly dominate on a turning ship), and `airburst`
as the rare tier of a `burst` locus (shell re-fires the plant's own profile in
a fan at the burst point). Both are combat features that arrive with zero new
UI because **the phenotype is the firing behavior**.

### 4.2 `ward` — defense enters through the genome
The defense gap should be solved the same way everything else is: breed it.
New rare recessive quirk **`ward`**: the plant becomes point-defense — instead
of (or in addition to, tune it) firing at hulls, it shoots down incoming enemy
shells that cross its range arc, at a water cost per intercept.

- It's a *mount slot you sacrifice* for safety, so it's a real build decision
  on a 2–6 mount ship, not a free stat.
- It obeys all three pillars: no new input, no new UI, and its coverage arc is
  positional — you still steer to keep the ward facing the incoming battery.
- Implementation: in the plant fire check (`game.ts:736-743`), ward plants
  target `bullets` with `friendly:false` inside range instead of ships;
  intercept = distance check against shell path, burst + `'break'` SFX on kill.

### 4.3 Elements stay as-is
Ember/frost/venom already have distinct combat identities (`game.ts:1261-1264`,
DoTs at `game.ts:679`, `711`, `714`); after 2.2's frost fix they're balanced
enough to leave until new enemy kinds create new element niches (e.g. venom vs
tender, frost vs fire-ship).

---

## Explicitly not doing

- **Manual fire / Space-to-shoot** — prototyped, retrospected, rejected
  (`BREEDING_REDESIGN.md:9-13`, `:28-33`). Hold-fire (1.5) is the
  decision-shaped version of the same itch.
- **The wand rig** — same verdict; its one good idea (shell-casts-the-stack)
  lands as the `airburst` allele (4.1).
- **Turreted/tracking plants** — would delete the helm-is-the-weapon pillar.
- **More HP scaling as difficulty** — Phase 3 exists so danger can scale by
  *composition* instead of `maxHp = size*(26+danger*5)` forever.

## Suggested order & sizing

| # | Item | Size | Why this order |
|---|------|------|----------------|
| 1 | 1.1–1.4 juice pass | S | Makes everything after tunable by feel |
| 2 | 1.5 hold-fire | S | One flag + one key; unlocks stealth/alpha-strike play immediately |
| 3 | 2.1 press + 2.2 frost DR | S–M | Closes both known degenerate loops |
| 4 | 3.1 fire-ship | M | First new behavior; reuses harrier chassis |
| 5 | 3.2 mortar barge | M | Salvages branch ballistics; second anti-kite |
| 6 | 4.1 homing/airburst | M | Coordinated with breeding redesign step 1 |
| 7 | 4.2 ward | M | Defense gap, genetics-shaped |
| 8 | 3.3 hulk/tender/nest | L | Once the above proves the variety frame |

Each item should ship with a play-check: the acceptance notes above (1.1, 1.5,
2.1) are the template — a concrete before/after scenario a human can verify in
one sail.
