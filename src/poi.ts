// Points of interest scattered across the sea — reasons to pick a heading.
// Cell POIs (wreck/nest/calm/trader/port) are a pure function of a coarse world
// grid (hash of the cell), so the same waters always hold the same sights; only
// state (salvaged, cleared, sold out, discovered) lives on the materialized POI.
// The breeder boat is the exception: a lone mover Game owns and drifts, so it
// can't be cell-derived.

import { Vec, v, hash01 } from './util'

export type POIKind = 'wreck' | 'nest' | 'calm' | 'trader' | 'port' | 'breeder' | 'hive'

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
  /** a hive you fired on — its garrison holds the grudge for the run */
  hostile: boolean
  /** heading, radians — only the wandering breeder boat uses it */
  heading?: number
}

export const POI_CELL = 1400
/** cells per side of a region block — one guaranteed port seeds each block */
export const PORT_REGION = 3

/** 💧 charged for one cross at a port or the breeder boat */
export const BREED_COST = 2

/** how far each kind reads on the horizon (edge markers + discovery) */
export const POI_SIGHT: Record<POIKind, number> = {
  wreck: 2200, // a smoke column carries
  nest: 1800,
  trader: 1500,
  calm: 1200,
  port: 2100, // a harbour is a landmark you can steer for
  breeder: 1700,
  hive: 2100, // a fortress island reads far — steer for it or around it
}

export const POI_ICON: Record<POIKind, string> = {
  wreck: '⚓',
  nest: '☠️',
  trader: '🏮',
  calm: '🌀',
  port: '🏝️',
  breeder: '🐝',
  hive: '🍯',
}

export const POI_COLOR: Record<POIKind, string> = {
  wreck: '#ffb74d',
  nest: '#ff6b6b',
  trader: '#b8e986',
  calm: '#9fd8ff',
  port: '#e6c88f',
  breeder: '#f4a6d0',
  hive: '#ffd257',
}

export const TRADE_COST = 6 // 🪵 per seed
export const TRADE_RANGE = 190

/** the single cell in each region block that carries the block's guaranteed port */
function portCellOf(cx: number, cy: number): { px: number; py: number } {
  const bx = Math.floor(cx / PORT_REGION)
  const by = Math.floor(cy / PORT_REGION)
  const ox = Math.floor(hash01(bx * 4.7 + 1.1, by * 8.9 - 2.3) * PORT_REGION)
  const oy = Math.floor(hash01(bx * 3.3 - 0.7, by * 5.1 + 4.4) * PORT_REGION)
  return { px: bx * PORT_REGION + ox, py: by * PORT_REGION + oy }
}

/** The POI seeded in a world cell, or null — deterministic per cell. */
export function cellPOI(cx: number, cy: number): POI | null {
  const px = (cx + 0.5 + (hash01(cx * 3.1, cy * 9.7) - 0.5) * 0.7) * POI_CELL
  const py = (cy + 0.5 + (hash01(cx * 8.3, cy * 2.9) - 0.5) * 0.7) * POI_CELL
  const home = Math.hypot(px, py)
  if (home < 700) return null // keep the spawn waters clear

  // a guaranteed port per region block — the reliable breeding anchor you can
  // plan a heading around (deeper waters just cost more sailing to reach one)
  const pc = portCellOf(cx, cy)
  if (pc.px === cx && pc.py === cy) return makePOI('port', v(px, py))

  if (hash01(cx * 13.37 + 7.7, cy * 7.13 - 3.1) > 0.34) return null
  const roll = hash01(cx * 5.7 - 1.3, cy * 11.9 + 8.8)
  let kind: POIKind
  if (roll < 0.3) kind = 'wreck'
  else if (roll < 0.52) kind = 'calm'
  else if (roll < 0.68) kind = 'trader'
  else if (roll < 0.78) kind = home > 1500 ? 'hive' : 'calm' // bee fortresses hold the rougher sea-lanes
  else kind = home > 1400 ? 'nest' : 'wreck' // nests only in rougher waters
  return makePOI(kind, v(px, py), hash01(cx * 1.9, cy * 17.3))
}

export function makePOI(kind: POIKind, pos: Vec, sizeRoll = 0.5): POI {
  const r =
    kind === 'calm'
      ? 260 + sizeRoll * 170
      : kind === 'nest'
        ? 320
        : kind === 'hive'
          ? 190
          : kind === 'port'
            ? 150
            : kind === 'breeder'
              ? 130
              : 110
  // ports never sell out; everything else starts with its own default state
  return {
    kind,
    pos,
    r,
    discovered: false,
    done: false,
    stock: kind === 'port' ? 99 : 2,
    nestUp: false,
    seeded: false,
    hostile: false,
    heading: 0,
  }
}
