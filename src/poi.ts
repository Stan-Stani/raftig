// Points of interest scattered across the sea — reasons to pick a heading.
// Placement is a pure function of a coarse world grid (hash of the cell), so
// the same waters always hold the same sights; only state (salvaged, cleared,
// sold out, discovered) lives on the materialized POI object in Game.

import { Vec, v, hash01 } from './util'

export type POIKind = 'wreck' | 'nest' | 'calm' | 'trader'

export interface POI {
  kind: POIKind
  pos: Vec
  /** effect / interaction radius */
  r: number
  /** telegraphed on the horizon at least once → shows on the minimap */
  discovered: boolean
  /** salvaged / cleared / sold out */
  done: boolean
  /** trader seeds left */
  stock: number
  /** nest pod currently at sea */
  nestUp: boolean
  /** becalmed flotsam already scattered */
  seeded: boolean
}

export const POI_CELL = 1400

/** how far each kind reads on the horizon (edge markers + discovery) */
export const POI_SIGHT: Record<POIKind, number> = {
  wreck: 2200, // a smoke column carries
  nest: 1800,
  trader: 1500,
  calm: 1200,
}

export const POI_ICON: Record<POIKind, string> = {
  wreck: '⚓',
  nest: '☠️',
  trader: '🏮',
  calm: '🌀',
}

export const POI_COLOR: Record<POIKind, string> = {
  wreck: '#ffb74d',
  nest: '#ff6b6b',
  trader: '#b8e986',
  calm: '#9fd8ff',
}

export const TRADE_COST = 6 // 🪵 per seed
export const TRADE_RANGE = 190

/** The POI seeded in a world cell, or null — deterministic per cell. */
export function cellPOI(cx: number, cy: number): POI | null {
  if (hash01(cx * 13.37 + 7.7, cy * 7.13 - 3.1) > 0.34) return null
  const px = (cx + 0.5 + (hash01(cx * 3.1, cy * 9.7) - 0.5) * 0.7) * POI_CELL
  const py = (cy + 0.5 + (hash01(cx * 8.3, cy * 2.9) - 0.5) * 0.7) * POI_CELL
  const home = Math.hypot(px, py)
  if (home < 750) return null // keep the spawn waters clear
  const roll = hash01(cx * 5.7 - 1.3, cy * 11.9 + 8.8)
  let kind: POIKind
  if (roll < 0.3) kind = 'wreck'
  else if (roll < 0.55) kind = 'calm'
  else if (roll < 0.72) kind = 'trader'
  else kind = home > 1400 ? 'nest' : 'wreck' // nests only in rougher waters
  return makePOI(kind, v(px, py), hash01(cx * 1.9, cy * 17.3))
}

export function makePOI(kind: POIKind, pos: Vec, sizeRoll = 0.5): POI {
  const r = kind === 'calm' ? 260 + sizeRoll * 170 : kind === 'nest' ? 320 : 110
  return { kind, pos, r, discovered: false, done: false, stock: 2, nestUp: false, seeded: false }
}
