# 🌱 raftig

A ship roguelike where your garden is the gun deck — plantig's seafaring
cousin. Your plants are cannon sown into fixed mounts on the hull; you work
the helm and keep the ecosystem afloat: sink raider ships for wood, boil wood
into fresh water, water the plants, and breed them into stranger and deadlier
cultivars.

## Run it

```sh
npm install
npm run dev
```

## The loop

- **Sail** — she handles like a ship: the prow (chevron on the leading edge)
  goes first. **A/D** work the helm, **W** sheets in and puts on way along the
  heading, **S** backs water — a windless crawl astern that also brakes.
  Momentum carries through turns; the keel gradually swings it in behind the
  prow. A wandering wind blows across the sea: running with it is fast,
  beating into it is a crawl — watch the wind arrow and tack. A fog-of-war
  minimap charts where you've been; ⌂ always points home, and faint danger
  rings show the gradient you're gambling against.
- **Explore** — sights telegraph on the horizon and are worth a heading:
  ⚓ smoking **wrecks** (one-time fat salvage), 🏮 **traders** (press T to
  barter 6🪵 for a good seed line), 🌀 **becalmed pools** (flotsam collects
  in the dead water, but your sail dies inside too), and ☠️ **raider nests**
  (a tethered pod guarding the wildest genes — clear it for a seed cache).
- **Hunt** — raider ships roam the open sea. Sail close and they eye you
  (❓) for a beat before committing (⚔️) — back off while they wonder and
  nothing happens. Waking one ship stirs its podmates, but only a few press
  the attack at once; the rest shadow you outside gun range, waiting for a
  slot. The farther from home waters, the deadlier the raiders — and the
  loot scales faster than the threat.
- **Flee** — hunters have *patience*: run clean and stop trading shots, and
  after a dozen-odd seconds they decide you're not worth the powder and break
  off. Every hit landed — theirs or yours — renews it, so a fight holds them
  and a retreat sheds them. Red-pennant **harriers** sprint on oars through
  any wind, but rowers blow: outlast the burst and even they fall away. No
  reinforcements spawn while a pack is already on you. Crews patch their
  hulls while you run, though — flee and the loot sails off with them.
- **Aim** — plants are **fixed gun mounts bolted to the deck**: they auto-fire
  along their mount heading whenever a raider drifts into range, never
  tracking it — and the mounts swing with the hull, so the helm is a weapon:
  turn the ship to bring a broadside to bear. Out of combat, the 🎯 tool
  re-points a mount on the deck: click a plant, then click where it should
  shoot. Headings lock while a raider is in range. Raider guns are fixed mounts too,
  ship-cannon style: red arrows mark their firing lines, and they hold fire
  until they've sailed a battery onto you — stay off the lines and rake them
  while they maneuver.
- **Salvage** — sunken ships break up into 🪵 wood and 💧 water; kill a gun
  and its seed line may float free. Kill a ship's *last* gun and her crew
  scuttles — the whole wreck is yours. Flotsam drifts by on the wind — set an
  intercept course; nothing floats to you for free (unless you breed a magnet
  plant).
- **Refit** — wood buys hulls, not planks: **U** refits skiff → sloop → brig
  → galleon, each with more gun mounts and a stouter hull. Out of combat your
  crew patches damage on their own — no hammering required.
- **Boil** — **B** burns 1🪵 → 2💧 fresh water on the galley stove. Salt
  water is free; drinkable water is the economy.
- **Garden** — sow seeds straight into empty mounts (🌱 tool; click a planted
  mount to dig it up). Plants need watering or they wilt, stop shooting, and
  die — they gulp water in battle but only sip while resting, so peaceful
  sailing is cheap.
- **Breed** — the 🐝 tool crosses two mature plants (2💧) into new seeds.
- Run ends when your hull gives out.

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
- Elements ride the bullets: **ember** burns hulls over time, **frost**
  chills ships and fire rates, **venom** shreds enemy plants.
- Quirks: **pierce** shoots through targets, **leech** waters its own plant
  per hit, **magnet** pulls floating loot toward your ship.
- Kill an enemy plant and it may drop its seed — sail far from home to steal
  wild genes where rare alleles run hotter.
- Seeds carry a pedigree badge (wild, F1, F2 …) and every genome gets a
  deterministic cultivar name (Brinefang, Squallpetal, …). Shiny ✦ marks a
  plant expressing at least one rare allele.

## Controls

A/D (or ←/→) helm · W (↑) sheet in · S (↓) back water · 1–4 tools (🌱💧🐝🎯) ·
B boils wood into water · U refits the hull · T trades with a nearby trader ·
Q/E or wheel picks seeds · right-click/Esc cancels breeding or aiming ·
H help · P pause · M mute · R restart after sinking.

Hover any plant — yours or theirs — to read its full genotype.
