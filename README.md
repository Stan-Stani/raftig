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

- **Fight** — hostile rafts raid in waves. Your mature plants auto-fire at
  anything in range. Enemy plants shoot back, with their own genetics.
- **Salvage** — destroyed enemy planks drop 🪵 wood; sunken rafts drop pots
  and water. Steer the raft (WASD) over floating loot to scoop it up.
- **Rebuild** — wood repairs and extends your deck (build tool), or…
- **Burn** — stoke the boiler: 1🪵 → 2💧 fresh water. Salt water is free;
  drinkable water is the economy.
- **Garden** — pots need 🏺 + 🟤 soil (both drift by on the current). Plants
  need regular watering or they wilt, stop shooting, and die.
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
- Kill an enemy plant and it may drop its seed — steal wild genes from late
  waves, where rare alleles run hotter.
- Seeds carry a pedigree badge (wild, F1, F2 …) and every genome gets a
  deterministic cultivar name (Brinefang, Squallpetal, …). Shiny ✦ marks a
  plant expressing at least one rare allele.

## Controls

WASD/arrows steer · 1–7 tools · Q/E or wheel picks seeds · right-click/Esc
cancels breeding · H help · P pause · M mute · R restart after sinking.

Hover any plant — yours or theirs — to read its full genotype.
