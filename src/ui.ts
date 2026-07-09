// Toolbar / seed-panel definitions and layout, shared by render (drawing)
// and game (hit-testing).

export type Tool = 'build' | 'pot' | 'plant' | 'water' | 'breed' | 'boiler' | 'remove' | 'aim'

export interface ToolDef {
  tool: Tool
  icon: string
  name: string
  tip: string
}

export const TOOLS: ToolDef[] = [
  { tool: 'build', icon: '🔨', name: 'build', tip: 'click a dashed cell to extend the raft (5🪵) · click a damaged tile to repair (1🪵)' },
  { tool: 'pot', icon: '🏺', name: 'pot', tip: 'click an empty tile to set a pot with soil (1🏺 + 1🟤)' },
  { tool: 'plant', icon: '🌱', name: 'plant', tip: 'pick a seed on the right (Q/E or wheel), then click a pot to sow it' },
  { tool: 'water', icon: '💧', name: 'water', tip: 'click a plant to water it (1💧) — dry plants wilt and die' },
  { tool: 'breed', icon: '🐝', name: 'breed', tip: 'click two mature plants within 2 tiles of each other to cross them (2💧)' },
  { tool: 'boiler', icon: '🔥', name: 'boiler', tip: 'click an empty tile to build a boiler (6🪵) · click a boiler to stoke it (1🪵 → 2💧)' },
  { tool: 'remove', icon: '⛏️', name: 'remove', tip: 'click to dig up a plant, or reclaim a pot / boiler' },
  { tool: 'aim', icon: '🎯', name: 'aim', tip: 'out of combat — click a plant, then click to point its fixed firing heading' },
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

export const SEED_ROW_H = 46
export const SEED_PANEL_W = 252
export const SEED_VISIBLE = 8

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
