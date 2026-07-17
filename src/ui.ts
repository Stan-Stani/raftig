// Toolbar / seed-panel definitions and the channeling-board layout, shared by
// render (drawing) and game (hit-testing) so the two never drift.

import { Board, BoardParent, slotChoices, slotSwitchCost, picksCost } from './breeding'
import { Genome, LocusId, LOCUS_ORDER, expressed, alleleDef } from './genetics'

export type Tool = 'plant' | 'water' | 'trim'

export interface ToolDef {
  tool: Tool
  icon: string
  name: string
  tip: string
}

export const TOOLS: ToolDef[] = [
  { tool: 'plant', icon: '🌱', name: 'plant', tip: 'pick a seed (Q/E or wheel), click an empty mount to sow · click a planted mount twice to dig it up' },
  { tool: 'water', icon: '💧', name: 'water', tip: 'click a plant to water it (1💧) — dry plants wilt and die · B boils 1🪵 → 2💧' },
  {
    tool: 'trim',
    icon: '🎯',
    name: 'trim',
    tip: 'click a plant, then the sea, to trim how far its shells range (out of combat) · Z/X still trims the whole battery live',
  },
]

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const inRect = (mx: number, my: number, r: Rect) =>
  mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h

const TOOL_SIZE = 58
const TOOL_GAP = 8

export function toolbarLayout(vw: number, vh: number): (Rect & { tool: Tool })[] {
  const total = TOOLS.length * TOOL_SIZE + (TOOLS.length - 1) * TOOL_GAP
  const x0 = (vw - total) / 2
  const y = vh - TOOL_SIZE - 16
  return TOOLS.map((t, i) => ({ tool: t.tool, x: x0 + i * (TOOL_SIZE + TOOL_GAP), y, w: TOOL_SIZE, h: TOOL_SIZE }))
}

export const SEED_ROW_H = 54
export const SEED_PANEL_W = 252
export const SEED_VISIBLE = 7

export function seedPanelRect(vw: number): Rect {
  return { x: vw - SEED_PANEL_W - 12, y: 86, w: SEED_PANEL_W, h: SEED_VISIBLE * SEED_ROW_H + 34 }
}

export function seedRowRects(vw: number, count: number, scroll: number): (Rect & { idx: number })[] {
  const panel = seedPanelRect(vw)
  const rows: (Rect & { idx: number })[] = []
  for (let i = 0; i < Math.min(SEED_VISIBLE, count - scroll); i++) {
    rows.push({ idx: scroll + i, x: panel.x + 6, y: panel.y + 30 + i * SEED_ROW_H, w: panel.w - 12, h: SEED_ROW_H - 4 })
  }
  return rows
}

export function restartRect(vw: number, vh: number): Rect {
  return { x: vw / 2 - 90, y: vh / 2 + 92, w: 180, h: 44 }
}

// ---- channeling board (breeding minigame) ----

export type BoardHit =
  | { kind: 'cancel' }
  | { kind: 'auto' }
  | { kind: 'cross' }
  | { kind: 'focus'; slot: 0 | 1 }
  | { kind: 'stock'; idx: number }
  | { kind: 'del'; idx: number }
  | { kind: 'allele'; locus: LocusId; slot: 0 | 1; allele: string }

export interface BoardChip {
  locus: LocusId
  slot: 0 | 1
  allele: string
  source: 'own' | 'wild'
  rect: Rect
  chosen: boolean
  /** pollen this rare placement costs (0 for commons / forced rares) */
  cost: number
  /** a rare you can't currently afford to switch to — drawn dimmed, click denied */
  locked: boolean
}
export interface BoardParentSlot {
  slot: 0 | 1
  rect: Rect
  parent: BoardParent | null
  focused: boolean
}
export interface BoardStockRow {
  idx: number
  rect: Rect
  entry: BoardParent
  /** ✕ toss-overboard zone — pouch seeds only, deck plants can't be deleted */
  delRect: Rect | null
}
export interface BoardLociRow {
  locus: LocusId
  rect: Rect
  expressedLabel: string
  expressedRare: boolean
  chips: BoardChip[]
}

export interface BoardLayout {
  panel: Rect
  parents: BoardParentSlot[]
  stock: BoardStockRow[]
  stockClip: Rect
  loci: BoardLociRow[]
  preview: Rect
  autoBtn: Rect
  crossBtn: Rect
  cancelBtn: Rect
  ready: boolean
  child: Genome | null
  hitTest(mx: number, my: number): BoardHit | null
}

const BOARD_BOTTOM = 92 // reserved for the preview line + buttons

export function boardLayout(vw: number, vh: number, board: Board): BoardLayout {
  const panelW = Math.min(vw - 48, 900)
  const panelH = Math.min(vh - 48, 660)
  const panel: Rect = { x: (vw - panelW) / 2, y: (vh - panelH) / 2, w: panelW, h: panelH }
  const pad = 18
  const headerH = 30
  const contentY = panel.y + pad + headerH
  const contentBottom = panel.y + panelH - pad - BOARD_BOTTOM

  // left column: two parent slots, then the scrollable stock list
  const leftX = panel.x + pad
  const leftW = 236
  const slotW = (leftW - 8) / 2
  const parents: BoardParentSlot[] = [0, 1].map(s => ({
    slot: s as 0 | 1,
    rect: { x: leftX + (s as number) * (slotW + 8), y: contentY, w: slotW, h: 54 },
    parent: board.parents[s as 0 | 1],
    focused: board.focus === s,
  }))
  const stockTop = contentY + 54 + 24 // headroom for a "stock" caption
  const stockClip: Rect = { x: leftX, y: stockTop, w: leftW, h: Math.max(60, contentBottom - stockTop) }
  const rowH = 30
  const visible = Math.floor(stockClip.h / rowH)
  const scroll = Math.min(board.scroll, Math.max(0, board.stock.length - visible))
  const stock: BoardStockRow[] = []
  for (let i = 0; i < Math.min(visible, board.stock.length - scroll); i++) {
    const idx = scroll + i
    const entry = board.stock[idx]
    const rect: Rect = { x: leftX, y: stockTop + i * rowH, w: leftW, h: rowH - 3 }
    const delRect: Rect | null =
      entry.seedId !== undefined ? { x: rect.x + rect.w - 22, y: rect.y, w: 22, h: rect.h } : null
    stock.push({ idx, rect, entry, delRect })
  }

  // main column: one row per locus, chips flanking the child's expressed trait
  const mainX = leftX + leftW + 16
  const mainW = panel.x + panelW - pad - mainX
  const rows = LOCUS_ORDER.length
  const gridH = contentBottom - contentY
  const lrH = Math.min(48, gridH / rows)
  const labelW = 58
  const centerW = 78
  const slotAreaW = (mainW - labelW - centerW) / 2
  const chipGap = 5
  const ready = !!board.offer && !!board.picks
  // pollen already committed by the current picks — a rare chip is affordable if
  // swapping it in (dropping this slot's current price) still fits the balance
  const committed = ready ? picksCost(board) : 0

  const loci: BoardLociRow[] = LOCUS_ORDER.map((locus, r) => {
    const y = contentY + r * lrH
    const rowRect: Rect = { x: mainX, y, w: mainW, h: lrH - 4 }
    const chips: BoardChip[] = []
    let expressedLabel = '—'
    let expressedRare = false
    if (ready && board.offer && board.picks) {
      const off = board.offer[locus]
      const picks = board.picks[locus]
      const exp = expressed(locus, picks)
      expressedLabel = exp.label
      expressedRare = !!exp.rare
      for (const slot of [0, 1] as const) {
        const choices = slotChoices(off, slot)
        const areaX = slot === 0 ? mainX + labelW : mainX + labelW + slotAreaW + centerW
        const chipW = Math.min(56, (slotAreaW - chipGap * (choices.length - 1)) / Math.max(1, choices.length))
        const curCost = slotSwitchCost(locus, off, slot, picks[slot], board.premium)
        choices.forEach((allele, ci) => {
          const cost = slotSwitchCost(locus, off, slot, allele, board.premium)
          const chosen = picks[slot] === allele
          chips.push({
            locus,
            slot,
            allele,
            source: off.wild === allele && !off[slot === 0 ? 'a' : 'b'].includes(allele) ? 'wild' : 'own',
            rect: { x: areaX + ci * (chipW + chipGap), y: y + 4, w: chipW, h: lrH - 12 },
            chosen,
            cost,
            locked: !chosen && committed - curCost + cost > board.pollen,
          })
        })
      }
    }
    return { locus, rect: rowRect, expressedLabel, expressedRare, chips }
  })

  const child: Genome | null =
    ready && board.picks ? (Object.fromEntries(LOCUS_ORDER.map(l => [l, [...board.picks![l]]])) as Genome) : null

  const btnY = panel.y + panelH - pad - 40
  const btnW = 120
  const cancelBtn: Rect = { x: panel.x + pad, y: btnY, w: btnW, h: 40 }
  const crossBtn: Rect = { x: panel.x + panelW - pad - btnW, y: btnY, w: btnW, h: 40 }
  const autoBtn: Rect = { x: crossBtn.x - btnW - 10, y: btnY, w: btnW, h: 40 }
  const preview: Rect = { x: panel.x + pad, y: contentBottom + 6, w: panelW - pad * 2, h: 30 }

  return {
    panel,
    parents,
    stock,
    stockClip,
    loci,
    preview,
    autoBtn,
    crossBtn,
    cancelBtn,
    ready,
    child,
    hitTest(mx, my) {
      if (inRect(mx, my, cancelBtn)) return { kind: 'cancel' }
      if (ready && inRect(mx, my, autoBtn)) return { kind: 'auto' }
      if (ready && inRect(mx, my, crossBtn)) return { kind: 'cross' }
      for (const p of parents) if (inRect(mx, my, p.rect)) return { kind: 'focus', slot: p.slot }
      // the ✕ sits inside the row, so it must claim the click first
      for (const s of stock) if (s.delRect && inRect(mx, my, s.delRect)) return { kind: 'del', idx: s.idx }
      for (const s of stock) if (inRect(mx, my, s.rect)) return { kind: 'stock', idx: s.idx }
      for (const row of loci) for (const c of row.chips) if (inRect(mx, my, c.rect)) return { kind: 'allele', locus: c.locus, slot: c.slot, allele: c.allele }
      return null
    },
  }
}

// re-exported so render can badge chips without re-importing genetics deeply
export function alleleSym(locus: LocusId, id: string): string {
  return alleleDef(locus, id).sym
}
