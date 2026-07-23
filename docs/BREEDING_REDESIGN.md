# Breeding redesign — research brief & design directions

*What makes genetics/breeding a satisfying, active minigame, and how raftig should
steal it. Backed by a deep-research pass (25 sources fetched, 117 claims, 22
adversarially verified) — full citations at the bottom.*

## TL;DR

The wand rig failed for a nameable reason: it was a **free, unlimited toolbox
divorced from the genetics**, so nothing was earned and the "I built this"
feeling never landed. Meanwhile the passive bees went the other way and removed
your agency entirely. Both miss the same target.

The games people love (Niche, Monster Hunter Stories 2, Pokémon breeding at its
best) converge on three ingredients:

1. **See the genotype.** Carriers are readable, not guessed. (Niche shows both
   alleles.) — raftig already has this in `describe()`.
2. **Roll upstream, author downstream.** The RNG happens *before* the build; the
   skill is arranging what you rolled. (MHS2's gene-placement "bingo"; Pokémon's
   Destiny Knot/Everstone/Power items.)
3. **Cap the frustration.** Pity floors, spend-to-choose currency, duplicate
   protection — so a bad streak has a bounded worst case. (Granblue sparking,
   FFXIV dupe protection.)

And two warnings the research is blunt about:

- **No evidence that a repeated *twitch/timing* breeding minigame stays fun.**
  Niche's "active" means a deliberate **selection choice**, not manual dexterity.
  The nearest evidence on active-but-fiddly loops (Palworld's must-find Dr. Brawn,
  Pokémon egg-hatching — the literal Smogon thread title is "how do you stay sane
  while breeding") points the *other* way: they become chores. So "active" here
  should mean *decision-rich per cross*, not *reflex-heavy per cross*.
- **Location-gating works only with a guaranteed cadence.** FTL guarantees N
  stores per sector, so you can *plan* around them. A pure must-find vendor reads
  as friction. (Two of your instincts — breed at ports, find the breeder boat —
  map cleanly onto this if ports are the guaranteed anchor and the boat is a
  bonus.)

---

## What the evidence says (ranked by confidence)

### High confidence

- **MHS2 "Rite of Channeling" is the template for an active-but-not-twitch
  crossing.** Every monster hatches with a random 3×3 gene board; you then
  *deterministically* transfer specific genes into chosen slots to line up
  "bingo" rows for stat/skill bonuses, with a **pre-commit preview** of the
  result. Randomness is in what you're handed; authorship is in the placement.
  [PC Gamer; Capcom manual]
- **Pokémon steering items convert RNG into direction.** Destiny Knot passes 5
  of 6 stat-genes from the parent pool (up from 3); Everstone locks nature; a
  Power item guarantees one specific stat-gene passes. You lock in most of a
  genotype and steer toward a target. (Everstone/Power are truly deterministic;
  Destiny Knot is an RNG-*reducer* — it raises the inherited count but not *which*
  genes.) [PokémonDB; Bulbapedia]
- **Niche = your exact model, and it works as a core loop.** Diploid Mendelian,
  best traits as rare recessives in carrier lines, both alleles shown in the UI
  (dominant on top drives phenotype, recessive shown faded below) so you read
  carriers **without test-breeding**. Its "active" is turn-based pair *selection*.
  [Niche wiki; FingerGuns review]
- **FTL stores = the good location-gate.** Guaranteed count per sector + optional
  divert = a *plannable* pacing anchor, not a scavenger hunt. [FTL wiki]
- **Bad-luck-mitigation is a real, named family.** Pity/guarantee after N
  failures; "sparking" (earn currency every attempt, later spend it on the exact
  target); duplicate protection (never re-award what you own). [TV Tropes;
  Bulbapedia/Masuda]

### Medium / cautionary

- **Palworld's Dr. Brawn is the anti-pattern.** A nomadic NPC you must locate to
  reroll stats — the game's own critics call the "troublesome steps and risks"
  a reason players *don't* bother optimizing. Precedent that a wandering optimizer
  becomes friction if it's the *only* path. [GameRant]

### Refuted (don't build on these)

- Pokémon IVs are **not** permanently hidden anymore — the in-game Judge exposes
  them (0-3 refuted). Use Niche, not "hidden IVs," as the transparency model.
- Pokémon breeding is **not** cleanly location-gated (1-2). Lean on **FTL** for
  the location-gating precedent, not Pokémon.

### Genuinely open (no precedent — raftig would be finding out)

- Does *any* active breeding minigame stay fun at the 50th rep? Untested. Keep
  per-cross friction low and let **scarcity** (gating) carry the specialness.
- Right transparency level for a *short roguelike run* vs a long collectathon —
  full visibility kills discovery tension but enables planning. Unresolved.
- Should cultivars persist across runs (meta-progression) or reset? No precedent.

---

## Design directions for raftig

### 1. Kill the rig. Fold ballistics into the genome as recessive carrier traits.

The wand behaviors were reinventing genetics. Most already *are* genes: `frost`
is an element allele; `pierce` is a quirk. Finish the job:

- **Homing** → new rare recessive **quirk** allele (`home`, alongside
  pierce/leech/magnet). Curves shots toward the nearest raider.
- **Airburst** → the interesting one. Model it as a rare recessive at a new
  **`burst`** locus (or reuse `barrel`'s rare tier): on impact the shell bursts
  and re-fires the plant's *own* profile in a small fan at the burst point. That
  turns "the shell casts the rest of the stack" (the one genuinely fun idea in
  the rig) into an **inherited** trait — the plant that carries `airburst` +
  `hydra` + `ember` is a walking cluster-mortar you *bred*, not rigged.

Now **the plant's phenotype IS its firing behavior**, surfacing a recessive
`homing` by crossing two carriers over a couple of generations becomes the
wand-building act — and it's earned, so it lands. No second UI.
*(Grounded in Niche's readable carriers + MHS2's behaviors-as-genes.)*

### 2. The crossing minigame = an allele-placement puzzle, not a timing bar.

When you breed at a port/boat, don't auto-roll. Show a **channeling board** (steal
MHS2 wholesale, over your already-built `describe()` view):

- Both parents lay their two alleles per locus face-up (you already render this).
- Meiosis offers you a *pool* of alleles (one slot per parent per locus, plus any
  mutation jackpots surfaced as wildcard tiles).
- **You place** which allele fills each of the child's 7 loci — with a live
  **phenotype preview** (dmg, rate, range, element, quirk, cultivar name, ✦).
- **Synergy "bingo" lines**: certain trait triples light up a bonus badge —
  e.g. `rapid + hydra + short` = "Grapeshot," `titan + spyglass + homing` =
  "Sniper." This gives the placement a puzzle to solve beyond raw stats.

RNG stays upstream (which alleles the parents + mutation offer); authorship is the
placement. Critically: **a few clicks, skippable with an "auto-best" button**, so
it never becomes the egg-hatching grind. Depth for those who want it, speed for
those who don't.

### 3. Gate to PORTS (guaranteed), breeder-boat as a bonus divert.

Resolve the active-vs-friction tension with *scarcity + reliability*:

- **Ports** = the FTL-store anchor. Guarantee one reachable port per region so
  the player can *plan* "I'll cross my two ember carriers when I hit the next
  port." Baseline crossing is cheap (a little water/wood) and deterministic-ish.
- **Breeder-boat** = a wandering high-value POI (your instinct, kept) that is
  *never the only option*, so missing it is never a wall. It sells the **Pokémon
  steering services** as consumables:
  - *Destiny Knot* → "child inherits more loci from parents, less mutation noise."
  - *Everstone* → "lock this one locus to a chosen parent."
  - *Power item* → "guarantee this specific allele passes."
  These are exactly the tools that turn breeding from gambling into engineering,
  and gating them behind a rare boat makes finding it a genuine score.

### 4. Put a floor under the 6% mutation (this matters *more* in a roguelike).

A long game absorbs bad luck; a single run can't. Stack bad-luck-mitigation onto
your existing `meiosis()`:

- **Pity**: track barren crosses (no new rare surfaced); after N, force the next
  mutation to jackpot a rare. Bounded worst case.
- **Spark currency**: earn a "pollen" token per cross; spend a stack at a
  port/boat to *guarantee* a chosen rare allele into the next child. Steerable
  determinism layered on the roll — the single best anti-save-scum pattern.
- **Duplicate protection**: bias mutation/wild-drops away from cultivars you
  already hold, so exploration converges on *new* genomes instead of re-rolling
  Brinefang for the tenth time. Your deterministic `cultivarName()` +
  pedigree badges already make "new vs owned" trivial to check.

### 5. Lineage bonus (optional flavor with teeth).

Steal the **Masuda method** shape: crossing two genetically *distant* lines
(different wild origins / far-apart pedigrees) boosts the mutation-jackpot odds
for that cross. It rewards going far from home to steal wild genes (which your
README already frames as the gene hunt) with *better rolls*, not just *more*
seeds — turning your existing "deeper water = hotter genomes" into a breeding
strategy, not just a loot gradient.

---

## How this threads your three instincts

| Your instinct | Verdict | Shape |
| --- | --- | --- |
| Fold wand behaviors into genetics | **Strongly supported** | Homing/airburst as rare recessive alleles (§1); phenotype = firing behavior, no second UI |
| Make breeding active | **Supported *with a caveat*** | Active = a placement *puzzle* (§2), not a timing minigame — and skippable; no evidence a repeated dexterity minigame survives, so lean on scarcity for specialness |
| Breed at ports / find the breeder boat | **Supported if ports are the anchor** | Ports guaranteed per region (FTL); boat is a bonus selling steering items (§3) — never the only gate, or it's Dr. Brawn friction |

## Suggested build order

1. **§1 first** — add homing/airburst alleles, delete the rig. Small, and it
   immediately tests whether "guns are genes" feels good with *zero* new UI.
2. **§3 port gate** — move crossing out of passive-bee auto and into a port
   interaction. Tests the pacing.
3. **§2 channeling board** — the placement puzzle, once §1/§3 prove the frame.
4. **§4 pity/spark** — tuning, once you see how often rares actually surface in a
   run.

---

## Sources

- Niche genetics (diploid Mendelian, visible carriers): https://niche.fandom.com/wiki/Genes · review: https://fingerguns.net/reviews/2020/09/08/niche-a-genetics-survival-game-switch-review-adapt-or-die-repeatedly/
- MHS2 Rite of Channeling (gene bingo, directed transfer): https://www.pcgamer.com/monster-hunter-stories-2-gene-rainbow-rite-of-channeling/
- Pokémon breeding items (Destiny Knot/Everstone/Power): https://pokemondb.net/mechanics/breeding · IVs & Judge: https://bulbapedia.bulbagarden.net/wiki/Individual_values · Masuda: https://bulbapedia.bulbagarden.net/wiki/Masuda_method
- Bad-luck mitigation (pity, sparking, dupe protection): https://tvtropes.org/pmwiki/pmwiki.php/Main/BadLuckMitigationMechanic
- FTL stores (location-gating as pacing anchor): https://ftl.fandom.com/wiki/Store
- Palworld Dr. Brawn (wandering optimizer = friction, cautionary): https://gamerant.com/palworld-dr-brawn-iv-skills-breeding-pokemon-competitive-good/
- Build authorship / IKEA effect (why earned builds feel yours): https://noonnoo.com/ · Bio Prototype organ-wiring: https://cubiccreativity.wordpress.com/2023/02/20/the-videogame-corner-bio-prototype/
