// Toolbar / seed-panel definitions and layout, shared by render (drawing)
// and game (hit-testing).

export type Tool = 'plant' | 'water'

export interface ToolDef {
  tool: Tool
  icon: string
  name: string
  tip: string
}

export const TOOLS: ToolDef[] = [
  { tool: 'plant', icon: '🌱', name: 'plant', tip: 'pick a seed (Q/E or wheel), click an empty mount to sow · click a planted mount to dig it up' },
  { tool: 'water', icon: '💧', name: 'water', tip: 'click a plant to water it (1💧) — dry plants wilt and die · B boils 1🪵 → 2💧' },
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
