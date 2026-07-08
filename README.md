# 🌱 raftig

A raft roguelike where your garden is the gun deck — plantig's seafaring
cousin. Your plants shoot raiders on their own; you keep the whole ecosystem
afloat: sink enemy rafts for wood, burn wood to desalinate sea water, water
the plants, and breed them into stranger and deadlier cultivars.

## Run it

```sh
npm install
npm run dev
```

## The loop

- **Sail** — a wandering wind blows across the sea. Running with it is fast;
  beating into it is a crawl. Watch the wind arrow and tack. A fog-of-war
  minimap charts where you've been; ⌂ always points home, and faint danger
  rings show the gradient you're gambling against.
- **Explore** — sights telegraph on the horizon and are worth a heading:
  ⚓ smoking **wrecks** (one-time fat salvage), 🏮 **traders** (press T to
  barter 6🪵 for a good seed line), 🌀 **becalmed pools** (flotsam collects
  in the dead water, but your sail dies inside too), and ☠️ **raider nests**
  (a tethered pod guarding the wildest genes — clear it for a seed cache).
- **Hunt** — raider rafts roam the open sea. Sail close and they eye you
  (❓) for a beat before committing (⚔️) — back off while they wonder and
  nothing happens. Waking one raft stirs its podmates, so pick where you
  engage. Fleeing works, but crews patch their hulls while you run: commit
  and finish, or eat the loss. Red-pennant **harriers** row through any
  wind — sink them or lose them in a gale. The farther from home waters,
  the deadlier the raiders — and the loot scales faster than the threat.
- **Salvage** — destroyed enemy planks drop 🪵 wood; sunken rafts drop pots
  and water. Kill a raft's last plant and its crew scuttles — the whole hull
  breaks up for you. Flotsam drifts by on the wind — set an intercept course;
  nothing floats to you for free (unless you breed a magnet plant).
- **Rebuild** — wood repairs and extends your deck (build tool), or…
- **Burn** — stoke the boiler: 1🪵 → 2💧 fresh water. Salt water is free;
  drinkable water is the economy.
- **Garden** — pots need 🏺 + 🟤 soil (both drift by on the current). Plants
  need watering or they wilt, stop shooting, and die — they gulp water in
  battle but only sip while resting, so peaceful sailing is cheap.
- **Breed** — the 🐝 tool crosses two mature plants (2💧) into new seeds.
- Run ends when your last plank sinks.

## Genetics (the plantig part)

Every plant is diploid: two alleles per locus, six loci.

| locus   | common                | uncommon        | rare recessive |
| ------- | --------------------- | --------------- | -------------- |
| power   | mild (4 dmg)          | stout (7)       | **titan (13)** |
| rate    | lazy (1.5s)           | brisk (1.0s)    | **rapid (0.55s)** |
| barrel  | single                | twin (2×0.7)    | **hydra (3×0.55)** |
| element | plain                 | ember/frost/venom | —            |
| thirst  | thirsty (1.8/s)       | hardy (0.9/s)   | **camel (0.35/s)** |
| quirk   | none                  | —               | **pierce / leech / magnet** |

- Dominant alleles mask recessives; the best traits are rare recessives, so
  they hide in **carrier lines** ([bH] shows single, breeds hydra) until you
  cross two carriers.
- Meiosis takes one allele from each parent per locus; ~6% of inherited
  alleles mutate, and a third of mutations jackpot into a rare allele.
- Elements ride the bullets: **ember** burns planks over time, **frost**
  chills rafts and fire rates, **venom** shreds enemy plants.
- Quirks: **pierce** shoots through targets, **leech** waters its own plant
  per hit, **magnet** pulls floating loot toward your raft.
- Kill an enemy plant and it may drop its seed — sail far from home to steal
  wild genes where rare alleles run hotter.
- Seeds carry a pedigree badge (wild, F1, F2 …) and every genome gets a
  deterministic cultivar name (Brinefang, Squallpetal, …). Shiny ✦ marks a
  plant expressing at least one rare allele.

## Controls

WASD/arrows sail (speed depends on the wind) · 1–7 tools · T trades with a
nearby trader · Q/E or wheel picks seeds · right-click/Esc cancels breeding ·
H help · P pause · M mute · R restart after sinking.

Hover any plant — yours or theirs — to read its full genotype.
