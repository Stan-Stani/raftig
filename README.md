# 🌱 raftig

A ship roguelike where your garden is the gun deck — plantig's seafaring
cousin. Your plants are mortars sown into fixed mounts on the hull; you work
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
- **Fire** — plants are **mortars in fixed mounts bolted to the deck**: they
  never fire on their own, never track, and never re-aim — each mount points
  where the shipwright set it, and the helm is the only traverse. Every shell
  arcs over the sea and **bursts exactly at the plant's bred reach**; the gold
  ring off each gun marks where its shells come down. **Space** pulls the
  lanyard — every loaded gun lobs a volley, then **reloads** on its own rate
  gene (an amber gauge winds up around the flower; a green ring means loaded).
  Hold **A/D with Space** to fire just the port or starboard rail (centreline
  chasers join any volley) — keep one broadside loaded while the other lands.
  **Z/X** crank the whole battery's elevation live (rings pull in to half
  reach); the **🎯 trim** tool sets each mount's own ranging out of combat —
  click a plant, then the sea — so a mixed deck holds different rings.
  Steering the burst rings over a raider and timing the volley is the whole
  skill: the helm is the weapon, and the reach gene is your rangefinder —
  breed short brawlers for the rail and spyglass snipers for standoff. Raider
  guns are mortars too, playing by the same rules: red rings mark where their
  shells burst, each hunter sails to put a ring on your hull (a spyglass line
  is a proper artillery ship), and gunners hold fire until it's there — keep
  way on and slip the drop zones while your own shells land.
- **Salvage** — sunken ships break up into 🪵 wood and 💧 water; kill a gun
  *carrying a rare line* and its seed may float free — deeper waters run
  hotter genomes, so range is the gene hunt. Kill a ship's *last* gun and her
  crew scuttles — the whole wreck is yours. Flotsam drifts by on the wind —
  set an intercept course; nothing floats to you for free (unless you field a
  magnet plant).
- **Refit** — wood buys hulls, not planks: **U** refits skiff → sloop → brig
  → galleon, each with more gun mounts and a stouter hull. Out of combat your
  crew patches damage on their own — no hammering required.
- **Boil** — **B** burns 1🪵 → 2💧 fresh water on the galley stove. Salt
  water is free; drinkable water is the economy.
- **Garden** — sow seeds straight into empty mounts (🌱 tool; click a planted
  mount to dig it up). Plants need watering or they wilt, stop shooting, and
  die — they gulp water in battle but only sip while resting, so peaceful
  sailing is cheap.
- **Breed** — the bees do it. Every so often, out of combat, two mature
  watered plants on deck quietly cross into a fresh seed (no tool, no cost) —
  so *what you choose to field is the breeding program*, and your pouch
  drifts toward the ship you're already sailing. You start with one plant and
  no seeds; loot or trade your way to a second plant and the pollen starts
  moving. The bees rest when the pouch is full.
- Run ends when your hull gives out.

## Genetics (the plantig part)

Every plant is diploid: two alleles per locus, eight loci.

| locus   | common                | uncommon        | rare recessive |
| ------- | --------------------- | --------------- | -------------- |
| power   | mild (4 dmg)          | stout (7)       | **titan (13)** |
| rate    | lazy (1.5s)           | brisk (1.0s)    | **rapid (0.55s)** |
| barrel  | single                | twin (2×0.7)    | **hydra (3×0.5)** |
| reach   | short (260)           | long (340)      | **spyglass (440)** |
| element | plain                 | ember/frost/venom | —            |
| thirst  | thirsty (1.8/s)       | hardy (0.9/s)   | **camel (0.35/s)** |
| quirk   | none                  | —               | **pierce / leech / magnet / homing / ward** |
| burst   | direct                | —               | **airburst**   |

- Dominant alleles mask recessives; the best traits are rare recessives, so
  they hide in **carrier lines** ([bH] shows single, breeds hydra) until the
  bees pair two carriers — field carriers side by side and wait for the ✦.
- Meiosis takes one allele from each parent per locus; ~6% of inherited
  alleles mutate, and a third of mutations jackpot into a rare allele.
- Elements ride the shells: **ember** burns hulls over time, **frost**
  chills ships and fire rates (with diminishing returns — a chilled crew
  shakes off repeat frost faster), **venom** shreds enemy plants but only
  wilts them down to a thread: the killing blow must be shot in, so a venom
  broadside can't scuttle a ship on its own.
- Quirks: **pierce** packs shrapnel (wider burst), **leech** waters its own
  plant per hit, **magnet** pulls floating loot toward your ship, **homing**
  curves shells toward the nearest raider, and **ward** turns the plant into
  point-defense — it never fires, it swats incoming shells out of its facing
  arc instead (a mount slot traded for safety; raider wards do it to you).
- **Airburst** (the burst locus) re-casts the plant's own volley in a cluster
  where the shell lands — a bred cluster-mortar, not a rigged one.
- Kill an enemy plant carrying a rare allele and it may drop its seed — sail
  far from home to steal wild genes where rare alleles run hotter, then sow
  the stolen line and let the bees fold it into your stock.
- Seeds carry a pedigree badge (wild, F1, F2 …) and every genome gets a
  deterministic cultivar name (Brinefang, Squallpetal, …). Shiny ✦ marks a
  plant expressing at least one rare allele.

## Controls

A/D (or ←/→) helm · W (↑) sheet in · S (↓) back water · **Space fires the
guns** (A/D+Space — one rail) · **Z/X battery elevation** · 1–3 tools
(🌱💧🎯) · B boils wood into water · U refits the hull · T trades with a
nearby trader · F docks to breed · Q/E or wheel picks seeds · H help ·
P pause · M mute · R restart after sinking.

Hover any plant — yours or theirs — to read its full genotype.
