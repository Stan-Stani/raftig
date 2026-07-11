// The channeling board — raftig's active breeding minigame. Docking at a port
// or the breeder boat opens it. You set two parents, then CHANNEL: for each
// locus you place one allele from each parent (or a mutation wildcard) into the
// child's two slots, reading a live phenotype preview as you go. The RNG is
// upstream — which parents you fielded, and which wildcards the cross offers —
// and the authorship is the placement. No rig: the genome IS the gun.

import { Genome, LocusId, LOCUS_ORDER, LOCI, alleleDef, expressed, mutationAllele } from './genetics'

/** how close to a port / breeder boat you must be to dock (F) */
export const DOCK_RANGE = 210

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
}

export function openBoard(premium: boolean, stock: BoardParent[]): Board {
  return { premium, stock, scroll: 0, parents: [null, null], focus: 0, offer: null, picks: null, childGen: 1 }
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
  for (const locus of LOCUS_ORDER) {
    const a: [string, string] = [pa.genome[locus][0], pa.genome[locus][1]]
    const b: [string, string] = [pb.genome[locus][0], pb.genome[locus][1]]
    const wild = Math.random() < wildChance ? mutationAllele(locus) : null
    offer[locus] = { a, b, wild }
    // default: a natural draw (one random allele from each parent), which the
    // player then edits — leaving it be just crosses them the ordinary way
    picks[locus] = [a[Math.random() < 0.5 ? 0 : 1], b[Math.random() < 0.5 ? 0 : 1]]
  }
  board.offer = offer
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

/** place an allele into a child slot (validated against the offer) */
export function boardPlace(board: Board, locus: LocusId, slot: 0 | 1, allele: string) {
  if (!board.offer || !board.picks) return
  if (!slotChoices(board.offer[locus], slot).includes(allele)) return
  board.picks[locus][slot] = allele
}

/** auto-fill: channel toward the strongest genome the cross allows — for each
 *  slot, take the rarest (lowest population weight) allele on offer, so carried
 *  recessives surface and wildcards get placed */
export function boardAuto(board: Board) {
  if (!board.offer || !board.picks) return
  for (const locus of LOCUS_ORDER) {
    const offer = board.offer[locus]
    for (const slot of [0, 1] as const) {
      const best = slotChoices(offer, slot).reduce((lo, id) => (alleleDef(locus, id).w < alleleDef(locus, lo).w ? id : lo))
      board.picks[locus][slot] = best
    }
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
