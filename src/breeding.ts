// The channeling board — raftig's active breeding minigame. Docking at a port
// or the breeder boat opens it. You set two parents, then CHANNEL: for each
// locus you place one allele from each parent (or a mutation wildcard) into the
// child's two slots, reading a live phenotype preview as you go. The RNG is
// upstream — which parents you fielded, and which wildcards the cross offers —
// and the authorship is the placement. No rig: the genome IS the gun.
//
// Scarcity keeps the placement from being a wishlist (BREEDING_REDESIGN §3/§4):
// common alleles are free to arrange, but placing a RARE recessive you didn't
// have to take costs POLLEN — a currency you earn one token per cross (two at a
// breeder boat, where rares are also half price: the "steering service"). So the
// good genomes are bred across several crosses, not assembled in one. A pity
// floor drips pollen on dry streaks, and wildcards dupe-protect toward rares your
// lines don't already carry.

import { Genome, LocusId, LOCUS_ORDER, LOCI, alleleDef, expressed, mutationAllele } from './genetics'
import { pick } from './util'

/** how close to a port / breeder boat you must be to dock (F) */
export const DOCK_RANGE = 210

/** pollen to place one rare recessive you could have skipped (per child slot) */
export const RARE_COST = 2
/** breeder boat halves it — its premium is cheaper steering, not just more wilds */
export const RARE_COST_PREMIUM = 1
/** pollen you start a run with — enough for one rare at a port on cross one */
export const POLLEN_START = 2
/** pollen earned per committed cross */
export const POLLEN_PER_CROSS = 1
/** extra pollen for crossing at a breeder boat */
export const POLLEN_PREMIUM_BONUS = 1
/** crosses that surface no rare before the pity floor pays out */
export const PITY_N = 3
/** pollen the pity floor drips once a dry streak hits PITY_N */
export const PITY_BONUS = 2

export interface BoardParent {
  genome: Genome
  gen: number
  /** where it came from — 'deck' or 'pouch' */
  label: string
  name: string
}

/** the pool the player channels from at one locus */
export interface LocusOffer {
  /** parent A's two alleles — candidates for the child's first slot */
  a: [string, string]
  /** parent B's two alleles — candidates for the child's second slot */
  b: [string, string]
  /** a mutation wildcard this cross surfaced (rare-weighted), or null */
  wild: string | null
}
export type Offer = Record<LocusId, LocusOffer>

export interface Board {
  premium: boolean
  stock: BoardParent[]
  scroll: number
  parents: [BoardParent | null, BoardParent | null]
  /** which parent slot the next stock pick fills */
  focus: 0 | 1
  offer: Offer | null
  /** the child's chosen alleles per locus — [from-A slot, from-B slot] */
  picks: Genome | null
  childGen: number
  /** pollen the player can spend on rare placements this cross (snapshot at open) */
  pollen: number
}

export function openBoard(premium: boolean, stock: BoardParent[], pollen: number): Board {
  return { premium, stock, scroll: 0, parents: [null, null], focus: 0, offer: null, picks: null, childGen: 1, pollen }
}

/** the pollen price of putting `allele` into a child slot: rares you chose over
 *  an available common allele cost; forced rares (no common option) and commons
 *  are free. Breeder boats halve the price. */
export function slotRareCost(locus: LocusId, offer: LocusOffer, slot: 0 | 1, allele: string, premium: boolean): number {
  if (!alleleDef(locus, allele).rare) return 0
  const hasCommon = slotChoices(offer, slot).some(id => !alleleDef(locus, id).rare)
  if (!hasCommon) return 0
  return premium ? RARE_COST_PREMIUM : RARE_COST
}

/** total pollen the current picks would spend */
export function picksCost(board: Board): number {
  if (!board.offer || !board.picks) return 0
  let sum = 0
  for (const locus of LOCUS_ORDER)
    for (const slot of [0, 1] as const)
      sum += slotRareCost(locus, board.offer[locus], slot, board.picks[locus][slot], board.premium)
  return sum
}

/** a slot's cheapest legal allele — a common one if the parent carries any, else
 *  the forced (free) rare */
function cheapestChoice(locus: LocusId, offer: LocusOffer, slot: 0 | 1): string {
  const choices = slotChoices(offer, slot)
  const common = choices.find(id => !alleleDef(locus, id).rare)
  return common ?? choices[0]
}

/** rare allele ids already carried anywhere in the player's lines — for
 *  dupe-protecting wildcards toward genes the fleet doesn't already hold */
function ownedRares(stock: BoardParent[]): Set<string> {
  const owned = new Set<string>()
  for (const s of stock)
    for (const locus of LOCUS_ORDER)
      for (const id of s.genome[locus]) if (alleleDef(locus, id).rare) owned.add(locus + ':' + id)
  return owned
}

/** a wildcard for the cross, dupe-protected: if the roll lands a rare the lines
 *  already carry, reroll toward one they don't (so exploration finds new genes) */
function wildFor(locus: LocusId, owned: Set<string>): string {
  const a = mutationAllele(locus)
  if (!alleleDef(locus, a).rare || !owned.has(locus + ':' + a)) return a
  const fresh = LOCI[locus].filter(x => x.rare && !owned.has(locus + ':' + x.id))
  return fresh.length ? pick(fresh).id : a
}

/** focus a parent slot so the next stock pick fills it */
export function boardFocus(board: Board, slot: 0 | 1) {
  board.focus = slot
}

/** drop a stock entry into the focused parent slot; regenerate the cross when
 *  both slots are filled */
export function boardChoose(board: Board, stockIdx: number) {
  const entry = board.stock[stockIdx]
  if (!entry) return
  board.parents[board.focus] = entry
  // hop focus to the other slot if it's still empty
  board.focus = board.parents[board.focus === 0 ? 1 : 0] ? board.focus : ((board.focus === 0 ? 1 : 0) as 0 | 1)
  regenerate(board)
}

function regenerate(board: Board) {
  const [pa, pb] = board.parents
  if (!pa || !pb) {
    board.offer = null
    board.picks = null
    return
  }
  const offer = {} as Offer
  const picks = {} as Genome
  const wildChance = board.premium ? 0.3 : 0.12
  const owned = ownedRares(board.stock)
  for (const locus of LOCUS_ORDER) {
    const a: [string, string] = [pa.genome[locus][0], pa.genome[locus][1]]
    const b: [string, string] = [pb.genome[locus][0], pb.genome[locus][1]]
    const wild = Math.random() < wildChance ? wildFor(locus, owned) : null
    offer[locus] = { a, b, wild }
    picks[locus] = ['', '']
  }
  board.offer = offer
  // default to the cheapest (all-common where possible) cross, so a fresh board
  // spends no pollen and every rare on it is a deliberate, paid upgrade
  for (const locus of LOCUS_ORDER)
    for (const slot of [0, 1] as const) picks[locus][slot] = cheapestChoice(locus, offer[locus], slot)
  board.picks = picks
  board.childGen = Math.max(pa.gen, pb.gen) + 1
}

/** the alleles legal in a given child slot: that parent's two, plus the wildcard */
export function slotChoices(offer: LocusOffer, slot: 0 | 1): string[] {
  const own = slot === 0 ? offer.a : offer.b
  const out = [own[0]]
  if (own[1] !== own[0]) out.push(own[1])
  if (offer.wild && !out.includes(offer.wild)) out.push(offer.wild)
  return out
}

/** place an allele into a child slot. Validated against the offer, and — for a
 *  rare that costs pollen — rejected (returns false) if the cross can't afford it. */
export function boardPlace(board: Board, locus: LocusId, slot: 0 | 1, allele: string): boolean {
  if (!board.offer || !board.picks) return false
  if (!slotChoices(board.offer[locus], slot).includes(allele)) return false
  const prev = board.picks[locus][slot]
  if (prev === allele) return true
  board.picks[locus][slot] = allele
  if (picksCost(board) > board.pollen) {
    board.picks[locus][slot] = prev // can't afford this rare — revert
    return false
  }
  return true
}

/** auto-fill: channel toward the strongest genome the pollen allows. Start from
 *  the free all-common cross, then buy rare upgrades rarest-first until pollen
 *  runs out — so carried recessives and wildcards surface within budget. */
export function boardAuto(board: Board) {
  if (!board.offer || !board.picks) return
  const offer = board.offer
  const picks = board.picks
  for (const locus of LOCUS_ORDER)
    for (const slot of [0, 1] as const) picks[locus][slot] = cheapestChoice(locus, offer[locus], slot)
  const upgrades: { locus: LocusId; slot: 0 | 1; allele: string; cost: number; w: number }[] = []
  for (const locus of LOCUS_ORDER)
    for (const slot of [0, 1] as const)
      for (const allele of slotChoices(offer[locus], slot)) {
        const cost = slotRareCost(locus, offer[locus], slot, allele, board.premium)
        if (cost > 0) upgrades.push({ locus, slot, allele, cost, w: alleleDef(locus, allele).w })
      }
  upgrades.sort((x, y) => x.w - y.w) // rarest (lowest population weight) first
  let budget = board.pollen
  const taken = new Set<string>()
  for (const u of upgrades) {
    const key = u.locus + u.slot
    if (taken.has(key) || u.cost > budget) continue
    picks[u.locus][u.slot] = u.allele
    budget -= u.cost
    taken.add(key)
  }
}

/** the finished child genome, or null if the cross isn't ready to commit */
export function boardCommit(board: Board): Genome | null {
  if (!board.parents[0] || !board.parents[1] || !board.picks) return null
  const g = {} as Genome
  for (const locus of LOCUS_ORDER) g[locus] = [board.picks[locus][0], board.picks[locus][1]]
  return g
}

/** named build synergies lit by the child's expressed traits — the "bingo"
 *  payoff that rewards clever placement with a recognisable weapon */
const SYNERGIES: { name: string; test: (t: Record<LocusId, string>) => boolean }[] = [
  { name: 'cluster storm', test: t => t.burst === 'airburst' && t.barrel === 'hydra' },
  { name: 'depth charge', test: t => t.burst === 'airburst' && t.power === 'titan' },
  { name: 'guided lance', test: t => t.quirk === 'homing' && t.reach === 'spyglass' },
  { name: 'swarm seeker', test: t => t.quirk === 'homing' && t.rate === 'rapid' },
  { name: 'grapeshot', test: t => (t.barrel === 'hydra' || t.barrel === 'twin') && t.rate === 'rapid' },
  { name: 'railshot', test: t => t.quirk === 'pierce' && t.reach === 'spyglass' },
  { name: 'bloodpetal', test: t => t.quirk === 'leech' && t.rate === 'rapid' },
  { name: 'patient siege', test: t => t.thirst === 'camel' && t.power === 'titan' },
  { name: 'blizzard', test: t => t.element === 'frost' && (t.barrel === 'hydra' || t.rate === 'rapid') },
  { name: 'firestorm', test: t => t.element === 'ember' && t.barrel === 'hydra' },
]

export function synergies(g: Genome): string[] {
  const t = {} as Record<LocusId, string>
  for (const locus of LOCUS_ORDER) t[locus] = expressed(locus, g[locus]).id
  return SYNERGIES.filter(s => s.test(t)).map(s => s.name)
}

/** true if the allele is that locus's rare recessive — for a ✦ chip highlight */
export function isRareAllele(locus: LocusId, id: string): boolean {
  return !!alleleDef(locus, id).rare
}

/** guard: the offer never surfaces an allele that isn't in LOCI (keeps the UI honest) */
export function alleleLabel(locus: LocusId, id: string): string {
  return LOCI[locus].some(a => a.id === id) ? alleleDef(locus, id).label : id
}
