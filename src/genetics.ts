// Diploid genetics for raft plants — a seafaring cousin of plantig's system.
// Every plant carries two alleles per locus. Meiosis hands one allele from
// each parent to the child, mutation can jackpot a rare recessive into any
// line, and rares only express when they aren't masked by a dominant common
// allele — so they hide in carrier lines until the right cross.

import { pick, weighted } from './util'

export type LocusId = 'power' | 'rate' | 'barrel' | 'reach' | 'element' | 'thirst' | 'quirk'
export const LOCUS_ORDER: LocusId[] = ['power', 'rate', 'barrel', 'reach', 'element', 'thirst', 'quirk']

export type Element = 'plain' | 'ember' | 'frost' | 'venom'
export type Quirk = 'none' | 'pierce' | 'leech' | 'magnet'

export interface AlleleDef {
  id: string
  sym: string
  label: string
  /** higher dominance expresses; ties → the first allele in the pair */
  dom: number
  /** wild-population weight (rares ≪ 1) */
  w: number
  rare?: boolean
  dmg?: number
  period?: number
  shots?: number
  mult?: number
  effect?: Element
  drain?: number
  quirk?: Quirk
  range?: number
  // --- coupling knobs: an allele's expressed cost bleeds into a neighbour stat,
  //     so no single trait is a free upgrade and genomes become archetypes ---
  /** heavy shot → slower cycle. multiplies firing period. */
  rateMult?: number
  /** fast/wide fire → thirstier. multiplies water drain. */
  drainMult?: number
  /** raw punch vs. reach/effect. multiplies per-shot damage. */
  dmgMult?: number
  /** efficient stock grows slow. multiplies time-to-mature. */
  growMult?: number
  /** radians between barrels of a volley — wide sprays miss at range. */
  spread?: number
}

export const LOCI: Record<LocusId, AlleleDef[]> = {
  // power ↔ rate: the bigger the ball, the slower the gun cycles.
  power: [
    { id: 'mild', sym: 'p', label: 'mild', dom: 1, w: 6, dmg: 4, rateMult: 0.85 },
    { id: 'stout', sym: 'P', label: 'stout', dom: 2, w: 3, dmg: 7, rateMult: 1.0 },
    { id: 'titan', sym: 'T', label: 'titan', dom: 0, w: 0.4, rare: true, dmg: 13, rateMult: 1.45 },
  ],
  // rate ↔ thirst: fast fire burns powder and water alike.
  rate: [
    { id: 'lazy', sym: 'r', label: 'lazy', dom: 1, w: 6, period: 1.5, drainMult: 0.8 },
    { id: 'brisk', sym: 'R', label: 'brisk', dom: 2, w: 3, period: 1.0, drainMult: 1.0 },
    { id: 'rapid', sym: 'Z', label: 'rapid', dom: 0, w: 0.4, rare: true, period: 0.55, drainMult: 1.8 },
  ],
  // barrel: more mouths, less per shot, wider spray (misses at range).
  barrel: [
    { id: 'single', sym: 'b', label: 'single', dom: 2, w: 6, shots: 1, mult: 1, spread: 0 },
    { id: 'twin', sym: 'B', label: 'twin', dom: 1, w: 2.5, shots: 2, mult: 0.7, spread: 0.12 },
    { id: 'hydra', sym: 'H', label: 'hydra', dom: 0, w: 0.3, rare: true, shots: 3, mult: 0.5, spread: 0.26 },
  ],
  // reach ↔ damage: a long glass throws a lighter ball.
  reach: [
    { id: 'short', sym: 'n', label: 'short', dom: 1, w: 6, range: 260, dmgMult: 1.15 },
    { id: 'long', sym: 'N', label: 'long', dom: 0, w: 2, range: 340, dmgMult: 0.95 },
    { id: 'spyglass', sym: 'S', label: 'spyglass', dom: 0, w: 0.3, rare: true, range: 440, dmgMult: 0.72 },
  ],
  // element: plain trades the effect for a cleaner, harder-hitting shot.
  element: [
    { id: 'plain', sym: 'e', label: 'plain', dom: 0, w: 6, dmgMult: 1.12 },
    { id: 'ember', sym: 'F', label: 'ember', dom: 1, w: 1.5, effect: 'ember' },
    { id: 'frost', sym: 'I', label: 'frost', dom: 1, w: 1.5, effect: 'frost' },
    { id: 'venom', sym: 'V', label: 'venom', dom: 1, w: 1.5, effect: 'venom' },
  ],
  // thirst ↔ growth: a frugal stock is slow to come online.
  thirst: [
    { id: 'thirsty', sym: 'w', label: 'thirsty', dom: 1, w: 5, drain: 1.8, growMult: 0.8 },
    { id: 'hardy', sym: 'W', label: 'hardy', dom: 0, w: 2.5, drain: 0.9, growMult: 1.0 },
    { id: 'camel', sym: 'C', label: 'camel', dom: 0, w: 0.25, rare: true, drain: 0.35, growMult: 1.4 },
  ],
  quirk: [
    { id: 'none', sym: 'q', label: '—', dom: 1, w: 6 },
    { id: 'pierce', sym: 'X', label: 'pierce', dom: 0, w: 0.5, rare: true, quirk: 'pierce' },
    { id: 'leech', sym: 'L', label: 'leech', dom: 0, w: 0.5, rare: true, quirk: 'leech' },
    { id: 'magnet', sym: 'M', label: 'magnet', dom: 0, w: 0.5, rare: true, quirk: 'magnet' },
  ],
}

/** allele-id pair per locus, e.g. genome.power = ['mild','stout'] */
export type Genome = Record<LocusId, [string, string]>

export interface Seed {
  id: number
  genome: Genome
  /** 0 = wild, 1 = F1, 2 = F2 … */
  gen: number
}

export interface Pheno {
  dmg: number
  period: number
  shots: number
  /** radians between barrels of a volley — wide sprays scatter at range */
  spread: number
  /** firing range, px — the gun engages nothing beyond it */
  range: number
  element: Element
  drain: number
  /** multiplies time-to-mature (thirst coupling); 1 = baseline */
  growMult: number
  quirk: Quirk
  /** deterministic cultivar name, plantig-style */
  name: string
  blurb: string
  /** one-line archetype read from the expressed stats (sniper, brawler …) */
  role: string
  /** expresses at least one rare allele → gets a sparkle */
  shiny: boolean
}

export function alleleDef(locus: LocusId, id: string): AlleleDef {
  const def = LOCI[locus].find(a => a.id === id)
  if (!def) throw new Error(`unknown allele ${locus}:${id}`)
  return def
}

/** Which allele of the pair phenotypically expresses. Ties → first allele. */
export function expressed(locus: LocusId, pair: [string, string]): AlleleDef {
  const a = alleleDef(locus, pair[0])
  const b = alleleDef(locus, pair[1])
  return b.dom > a.dom ? b : a
}

const NAME_PRE = ['Salt', 'Brine', 'Gale', 'Coral', 'Dawn', 'Mist', 'Tide', 'Wrack', 'Pearl', 'Squall', 'Kelp', 'Fog']
const NAME_SUF = ['whisper', 'fang', 'bloom', 'lash', 'crown', 'drift', 'spark', 'thorn', 'veil', 'heart', 'wake', 'petal']

function genomeHash(g: Genome): number {
  let h = 2166136261
  for (const locus of LOCUS_ORDER) {
    for (const id of g[locus]) {
      for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i)
        h = Math.imul(h, 16777619)
      }
    }
  }
  return h >>> 0
}

export function cultivarName(g: Genome): string {
  const h = genomeHash(g)
  return NAME_PRE[h % NAME_PRE.length] + NAME_SUF[Math.floor(h / 64) % NAME_SUF.length]
}

/** One-word archetype from the loudest expressed traits — the genome's character. */
function roleOf(power: AlleleDef, rate: AlleleDef, barrel: AlleleDef, reach: AlleleDef): string {
  if (reach.id === 'spyglass') return power.id === 'titan' ? 'siege sniper' : 'sniper'
  if (barrel.id === 'hydra') return reach.id === 'short' ? 'scattergun' : 'sprayer'
  if (power.id === 'titan') return 'siege gun'
  if (rate.id === 'rapid') return 'autocannon'
  if (reach.id === 'short' && power.id !== 'mild') return 'brawler'
  if (barrel.id === 'twin') return 'raker'
  return 'popgun'
}

export function phenotype(g: Genome): Pheno {
  const power = expressed('power', g.power)
  const rate = expressed('rate', g.rate)
  const barrel = expressed('barrel', g.barrel)
  const reach = expressed('reach', g.reach)
  const element = expressed('element', g.element)
  const thirst = expressed('thirst', g.thirst)
  const quirk = expressed('quirk', g.quirk)
  // couplings: an allele's cost lands on a neighbour stat (see LOCI comments)
  const dmg = power.dmg! * barrel.mult! * (reach.dmgMult ?? 1) * (element.dmgMult ?? 1)
  const period = rate.period! * (power.rateMult ?? 1)
  const drain = thirst.drain! * (rate.drainMult ?? 1)
  const parts = [element.effect ?? 'plain', barrel.label, power.label]
  if (reach.id !== 'short') parts.push(reach.label)
  if (quirk.quirk && quirk.quirk !== 'none') parts.push(quirk.quirk)
  return {
    dmg: Math.round(dmg * 10) / 10,
    period: Math.round(period * 100) / 100,
    shots: barrel.shots!,
    spread: barrel.spread ?? 0,
    range: reach.range!,
    element: element.effect ?? 'plain',
    drain: Math.round(drain * 100) / 100,
    growMult: thirst.growMult ?? 1,
    quirk: quirk.quirk ?? 'none',
    name: cultivarName(g),
    blurb: parts.join(' · '),
    role: roleOf(power, rate, barrel, reach),
    shiny: [power, rate, barrel, reach, element, thirst, quirk].some(a => a.rare),
  }
}

/** "Pp Rr bb eF ww qq" — genotype at a glance, for breeding nerds */
export function symbols(g: Genome): string {
  return LOCUS_ORDER.map(l => g[l].map(id => alleleDef(l, id).sym).join('')).join(' ')
}

/** One line per locus: expressed trait, genotype, and hidden carriers. */
export function describe(g: Genome): string[] {
  return LOCUS_ORDER.map(locus => {
    const pair = g[locus]
    const exp = expressed(locus, pair)
    const syms = pair.map(id => alleleDef(locus, id).sym).join('')
    let line = `${locus.padEnd(7)} ${exp.label} [${syms}]`
    const carried = pair
      .map(id => alleleDef(locus, id))
      .filter(a => a.rare && a.id !== exp.id)
    if (carried.length) line += ` · carries ${carried[0].label}`
    return line
  })
}

/** Sample a wild genome; rareBoost > 1 makes rare alleles likelier (late waves). */
export function wildGenome(rareBoost = 1): Genome {
  const g = {} as Genome
  for (const locus of LOCUS_ORDER) {
    const roll = () => weighted(LOCI[locus], a => a.w * (a.rare ? rareBoost : 1)).id
    g[locus] = [roll(), roll()]
  }
  return g
}

/** Chance per inherited allele that it mutates. */
export const MUTATION_RATE = 0.06
/** Of those mutations, chance it jackpots into a rare allele of that locus. */
const JACKPOT_RATE = 0.35

function meiosis(g: Genome, locus: LocusId): string {
  const inherited = g[locus][Math.random() < 0.5 ? 0 : 1]
  if (Math.random() >= MUTATION_RATE) return inherited
  const rares = LOCI[locus].filter(a => a.rare)
  if (rares.length && Math.random() < JACKPOT_RATE) return pick(rares).id
  return pick(LOCI[locus]).id
}

/** Cross two genomes: one allele from each parent per locus, plus mutation. */
export function breed(a: Genome, b: Genome): Genome {
  const child = {} as Genome
  for (const locus of LOCUS_ORDER) {
    child[locus] = [meiosis(a, locus), meiosis(b, locus)]
  }
  return child
}

/** Build a genome from overrides on an all-common baseline. */
export function makeGenome(spec: Partial<Record<LocusId, [string, string]>> = {}): Genome {
  return {
    power: spec.power ?? ['mild', 'mild'],
    rate: spec.rate ?? ['lazy', 'lazy'],
    barrel: spec.barrel ?? ['single', 'single'],
    reach: spec.reach ?? ['short', 'short'],
    element: spec.element ?? ['plain', 'plain'],
    thirst: spec.thirst ?? ['thirsty', 'thirsty'],
    quirk: spec.quirk ?? ['none', 'none'],
  }
}
