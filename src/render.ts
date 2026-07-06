import { Game, TS, RANGE, TILE_HP, FUEL_TIME, FUEL_CAP, Plant, Bullet, EnemyRaft } from './game'
import { describe, symbols, phenotype, Genome, Pheno } from './genetics'
import { TOOLS, toolbarLayout, seedPanelRect, seedRowRects, restartRect, SEED_VISIBLE } from './ui'
import { muted } from './audio'
import { Vec, hash01, clamp, gkey } from './util'

const ELEMENT_COLOR: Record<string, string> = {
  plain: '#ffd257',
  ember: '#ff7a45',
  frost: '#7fd8ff',
  venom: '#b07fff',
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function render(ctx: CanvasRenderingContext2D, g: Game) {
  const { vw: w, vh: h } = g
  const t = g.time

  // sea
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#0d4a6f')
  grad.addColorStop(1, '#072a40')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  const shakeX = g.shake > 0.1 ? (Math.random() - 0.5) * g.shake : 0
  const shakeY = g.shake > 0.1 ? (Math.random() - 0.5) * g.shake : 0

  ctx.save()
  ctx.translate(w / 2 - g.cam.x + shakeX, h / 2 - g.cam.y + shakeY)

  drawWaves(ctx, g, w, h, t)
  for (const l of g.loot) drawLoot(ctx, l.pos, l.kind, l.phase, l.ttl)
  for (const e of g.enemies) drawEnemyRaft(ctx, g, e, t)
  drawPlayerRaft(ctx, g, t)
  for (const b of g.bullets) drawBullet(ctx, g, b)
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // floating texts
  ctx.textAlign = 'center'
  ctx.font = 'bold 13px ui-monospace, monospace'
  for (const ft of g.texts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, ft.life))
    ctx.fillStyle = '#00000088'
    ctx.fillText(ft.text, ft.pos.x + 1, ft.pos.y + 1)
    ctx.fillStyle = ft.color
    ctx.fillText(ft.text, ft.pos.x, ft.pos.y)
  }
  ctx.globalAlpha = 1

  ctx.restore()

  drawHud(ctx, g, w, h, t)
}

function drawWaves(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number, t: number) {
  const cell = 90
  const x0 = Math.floor((g.cam.x - w / 2) / cell) - 1
  const x1 = Math.floor((g.cam.x + w / 2) / cell) + 1
  const y0 = Math.floor((g.cam.y - h / 2) / cell) - 1
  const y1 = Math.floor((g.cam.y + h / 2) / cell) + 1
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  for (let gx = x0; gx <= x1; gx++) {
    for (let gy = y0; gy <= y1; gy++) {
      const r = hash01(gx, gy)
      if (r > 0.55) continue
      const x = gx * cell + r * 60
      const y = gy * cell + hash01(gy, gx) * 60 + Math.sin(t * 1.3 + r * 12) * 3
      ctx.globalAlpha = 0.06 + 0.05 * Math.sin(t * 0.9 + r * 20)
      ctx.beginPath()
      ctx.arc(x, y, 7 + r * 8, Math.PI * 0.15, Math.PI * 0.85)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}

function drawLoot(ctx: CanvasRenderingContext2D, pos: Vec, kind: string, phase: number, ttl: number) {
  const icons: Record<string, string> = { wood: '🪵', pot: '🏺', soil: '🟤', seed: '🌰', water: '💧' }
  const bob = Math.sin(phase * 2) * 3
  ctx.globalAlpha = ttl < 6 ? 0.35 + 0.5 * Math.abs(Math.sin(ttl * 5)) : 1
  ctx.fillStyle = '#00000033'
  ctx.beginPath()
  ctx.ellipse(pos.x, pos.y + 8, 11, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = '20px serif'
  ctx.textAlign = 'center'
  ctx.fillText(icons[kind] ?? '❓', pos.x, pos.y + bob)
  ctx.globalAlpha = 1
}

function drawPlank(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, maxHp: number, hostile: boolean, burnT: number) {
  const half = TS / 2 - 1
  ctx.fillStyle = hostile ? '#4f3d2c' : '#8a6a45'
  roundRect(ctx, x - half, y - half, half * 2, half * 2, 5)
  ctx.fill()
  ctx.strokeStyle = hostile ? '#33271b' : '#5f4830'
  ctx.lineWidth = 2
  ctx.stroke()
  // plank seams
  ctx.strokeStyle = '#00000022'
  ctx.lineWidth = 1
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(x - half + 3, y + (i * half * 2) / 3)
    ctx.lineTo(x + half - 3, y + (i * half * 2) / 3)
    ctx.stroke()
  }
  const frac = hp / maxHp
  if (frac < 0.999) {
    ctx.fillStyle = `rgba(20,10,5,${(1 - frac) * 0.45})`
    roundRect(ctx, x - half, y - half, half * 2, half * 2, 5)
    ctx.fill()
  }
  if (frac < 0.6) {
    ctx.strokeStyle = '#00000055'
    ctx.beginPath()
    ctx.moveTo(x - half * 0.5, y - half * 0.6)
    ctx.lineTo(x + half * 0.1, y + half * 0.2)
    ctx.lineTo(x - half * 0.2, y + half * 0.7)
    ctx.stroke()
  }
  if (burnT > 0) {
    ctx.fillStyle = `rgba(255,120,40,${0.25 + 0.15 * Math.sin(burnT * 20)})`
    roundRect(ctx, x - half, y - half, half * 2, half * 2, 5)
    ctx.fill()
  }
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, p: Plant, hostile: boolean, t: number) {
  const s = 0.35 + 0.65 * p.growth
  const dry = !hostile && p.water <= 0
  const sway = Math.sin(t * 2 + p.wobble) * 2 * s + (dry ? 4 : 0)
  const stemH = 24 * s
  const headX = x + sway
  const headY = y - 6 - stemH

  ctx.strokeStyle = dry ? '#8b7d5a' : hostile ? '#5c7a3e' : '#3e8a50'
  ctx.lineWidth = 2.5 * s
  ctx.beginPath()
  ctx.moveTo(x, y - 4)
  ctx.quadraticCurveTo(x + sway * 0.4, y - 6 - stemH * 0.5, headX, headY)
  ctx.stroke()

  // leaves
  ctx.fillStyle = dry ? '#9b8b62' : hostile ? '#6d8f4a' : '#4e9a5f'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(x + side * 6 * s + sway * 0.3, y - 8 - stemH * 0.4, 6 * s, 3 * s, side * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // flower head — colored by element, bud until mature
  const color = dry ? '#a89d80' : ELEMENT_COLOR[p.pheno.element]
  const r = (p.growth >= 1 ? 6.5 : 3.5 + p.growth * 2.5) * (0.8 + 0.2 * s)
  if (p.growth >= 1) {
    ctx.fillStyle = color
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + t * 0.2 + p.wobble
      ctx.beginPath()
      ctx.arc(headX + Math.cos(a) * r * 0.8, headY + Math.sin(a) * r * 0.8, r * 0.55, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = hostile ? '#3a2a2a' : '#fff8e1'
    ctx.beginPath()
    ctx.arc(headX, headY, r * 0.45, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(headX, headY, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // shiny sparkle for expressed rare alleles (plantig homage)
  if (p.pheno.shiny && p.growth >= 1) {
    const a = 0.5 + 0.5 * Math.sin(t * 4 + p.wobble)
    ctx.globalAlpha = a
    ctx.fillStyle = '#ffffff'
    ctx.font = '9px serif'
    ctx.textAlign = 'center'
    ctx.fillText('✦', headX + 9, headY - 8)
    ctx.fillText('✦', headX - 8, headY + 2)
    ctx.globalAlpha = 1
  }

  if (p.burnT > 0) {
    ctx.fillStyle = `rgba(255,120,40,${0.3 + 0.2 * Math.sin(p.burnT * 18)})`
    ctx.beginPath()
    ctx.arc(headX, headY, r + 3, 0, Math.PI * 2)
    ctx.fill()
  }
  if (p.poisonT > 0) {
    ctx.fillStyle = 'rgba(176,127,255,0.3)'
    ctx.beginPath()
    ctx.arc(headX, headY, r + 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawWaterBar(ctx: CanvasRenderingContext2D, x: number, y: number, p: Plant) {
  if (p.water >= 95) return
  const bw = TS - 14
  ctx.fillStyle = '#00000066'
  roundRect(ctx, x - bw / 2, y + TS / 2 - 7, bw, 4, 2)
  ctx.fill()
  ctx.fillStyle = p.water < 25 ? '#ff8a65' : '#4fc3f7'
  const fw = Math.max(1, (bw - 2) * (p.water / 100))
  roundRect(ctx, x - bw / 2 + 1, y + TS / 2 - 6, fw, 2, 1)
  ctx.fill()
}

function drawPlayerRaft(ctx: CanvasRenderingContext2D, g: Game, t: number) {
  // build ghosts first (under tiles)
  if (g.tool === 'build' && !g.over) {
    for (const c of g.buildableCells()) {
      const p = g.tilePos(c)
      const hovered = Math.abs(g.hover.x - p.x) < TS / 2 && Math.abs(g.hover.y - p.y) < TS / 2
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = g.wood >= 5 ? (hovered ? '#b8e986' : '#b8e98666') : '#ff8a6566'
      ctx.lineWidth = 2
      roundRect(ctx, p.x - TS / 2 + 3, p.y - TS / 2 + 3, TS - 6, TS - 6, 5)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  for (const tile of g.tiles.values()) {
    const p = g.tilePos(tile)
    drawPlank(ctx, p.x, p.y, tile.hp, TILE_HP, false, tile.burnT)
  }
  // structures on top
  for (const tile of g.tiles.values()) {
    const p = g.tilePos(tile)
    const s = tile.structure
    if (!s) continue
    if (s.kind === 'boiler') {
      drawBoiler(ctx, p.x, p.y, s.fuel, s.progress, t)
    } else {
      drawPot(ctx, p.x, p.y)
      if (s.plant) {
        // breed selection ring
        if (g.breedFirst === gkey(tile.gx, tile.gy)) {
          ctx.strokeStyle = `rgba(255,210,87,${0.6 + 0.4 * Math.sin(t * 6)})`
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(p.x, p.y - 12, 20, 0, Math.PI * 2)
          ctx.stroke()
        }
        drawPlant(ctx, p.x, p.y, s.plant, false, t)
        drawWaterBar(ctx, p.x, p.y, s.plant)
        if (s.plant.breedCd > 0) {
          ctx.strokeStyle = '#ffffff44'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.x, p.y - 34, 5, -Math.PI / 2, -Math.PI / 2 + (1 - s.plant.breedCd / 18) * Math.PI * 2)
          ctx.stroke()
        }
      }
    }
  }

  // hovering a mature plant → show range
  const hi = g.hoverInfo
  if (hi && !hi.hostile && hi.plant.growth >= 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.beginPath()
    ctx.arc(hi.pos.x, hi.pos.y, RANGE, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // breed line to cursor
  if (g.tool === 'breed' && g.breedFirst) {
    const ft = g.tiles.get(g.breedFirst)
    if (ft) {
      const fp = g.tilePos(ft)
      ctx.strokeStyle = '#ffd25788'
      ctx.setLineDash([6, 5])
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(fp.x, fp.y - 12)
      ctx.lineTo(g.hover.x, g.hover.y)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
}

function drawPot(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#b5654a'
  ctx.beginPath()
  ctx.moveTo(x - 11, y - 8)
  ctx.lineTo(x + 11, y - 8)
  ctx.lineTo(x + 8, y + 8)
  ctx.lineTo(x - 8, y + 8)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#7d4433'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#4a3627'
  ctx.beginPath()
  ctx.ellipse(x, y - 8, 10, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawBoiler(ctx: CanvasRenderingContext2D, x: number, y: number, fuel: number, progress: number, t: number) {
  ctx.fillStyle = '#546e7a'
  ctx.beginPath()
  ctx.arc(x, y - 4, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#37474f'
  ctx.lineWidth = 2
  ctx.stroke()
  // spout
  ctx.fillStyle = '#455a64'
  ctx.fillRect(x + 8, y - 14, 5, 8)
  if (fuel > 0) {
    ctx.fillStyle = `rgba(255,140,66,${0.7 + 0.3 * Math.sin(t * 10)})`
    ctx.beginPath()
    ctx.arc(x, y + 9, 5 + Math.sin(t * 12) * 1.5, 0, Math.PI * 2)
    ctx.fill()
    // progress arc toward next 💧
    ctx.strokeStyle = '#7fd8ff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y - 4, 15, -Math.PI / 2, -Math.PI / 2 + (progress / FUEL_TIME) * Math.PI * 2)
    ctx.stroke()
  }
  // fuel pips
  ctx.fillStyle = '#e8c98a'
  for (let i = 0; i < FUEL_CAP; i++) {
    ctx.globalAlpha = i < fuel ? 1 : 0.2
    ctx.fillRect(x - 12 + i * 7, y + 16, 5, 3)
  }
  ctx.globalAlpha = 1
}

function drawEnemyRaft(ctx: CanvasRenderingContext2D, g: Game, e: EnemyRaft, t: number) {
  for (const tile of e.tiles) {
    const p = g.etilePos(e, tile)
    drawPlank(ctx, p.x, p.y, tile.hp, tile.maxHp, true, tile.burnT)
  }
  for (const tile of e.tiles) {
    if (!tile.plant) continue
    const p = g.etilePos(e, tile)
    drawPot(ctx, p.x, p.y)
    drawPlant(ctx, p.x, p.y, tile.plant, true, t)
  }
  if (e.chillT > 0) {
    ctx.fillStyle = 'rgba(127,216,255,0.12)'
    for (const tile of e.tiles) {
      const p = g.etilePos(e, tile)
      roundRect(ctx, p.x - TS / 2, p.y - TS / 2, TS, TS, 5)
      ctx.fill()
    }
  }
}

function drawBullet(ctx: CanvasRenderingContext2D, g: Game, b: Bullet) {
  const color = g.bulletColor(b)
  const r = clamp(2.5 + b.dmg * 0.12, 2.5, 5)
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.35
  ctx.lineWidth = r
  ctx.beginPath()
  ctx.moveTo(b.pos.x - b.vel.x * 0.03, b.pos.y - b.vel.y * 0.03)
  ctx.lineTo(b.pos.x, b.pos.y)
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(b.pos.x, b.pos.y, r, 0, Math.PI * 2)
  ctx.fill()
  if (!b.friendly) {
    ctx.strokeStyle = '#00000055'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

// ---------- HUD ----------

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): number {
  ctx.font = '14px ui-monospace, monospace'
  const w = ctx.measureText(text).width + 18
  ctx.fillStyle = 'rgba(4,20,32,0.75)'
  roundRect(ctx, x, y, w, 26, 13)
  ctx.fill()
  ctx.fillStyle = '#e8f1f5'
  ctx.textAlign = 'left'
  ctx.fillText(text, x + 9, y + 18)
  return w
}

function drawHud(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number, t: number) {
  // resources
  let x = 12
  x += chip(ctx, x, 12, `🪵 ${g.wood}`) + 6
  x += chip(ctx, x, 12, `💧 ${g.water}`) + 6
  x += chip(ctx, x, 12, `🏺 ${g.pots}`) + 6
  x += chip(ctx, x, 12, `🟤 ${g.soil}`) + 6
  x += chip(ctx, x, 12, `🌰 ${g.seeds.length}`) + 6
  if (g.chillT > 0) chip(ctx, x, 12, '❄ chilled!')

  // wave status
  const mins = Math.floor(g.stats.time / 60)
  const secs = Math.floor(g.stats.time % 60)
  const status =
    g.phase === 'calm'
      ? `wave ${g.wave} · raid in ${Math.ceil(g.phaseT)}s`
      : `wave ${g.wave} · ${g.enemies.length} raft${g.enemies.length === 1 ? '' : 's'} left`
  ctx.font = 'bold 15px ui-monospace, monospace'
  const sw = ctx.measureText(status).width + 24
  ctx.fillStyle = g.phase === 'raid' ? 'rgba(80,16,16,0.8)' : 'rgba(4,20,32,0.75)'
  roundRect(ctx, w / 2 - sw / 2, 12, sw, 28, 14)
  ctx.fill()
  ctx.fillStyle = '#e8f1f5'
  ctx.textAlign = 'center'
  ctx.fillText(status, w / 2, 31)

  // right chips
  ctx.font = '14px ui-monospace, monospace'
  const right = `☠ ${g.stats.sunk} · ${mins}:${secs.toString().padStart(2, '0')}${muted ? ' · 🔇' : ''}`
  const rw = ctx.measureText(right).width + 18
  chip(ctx, w - rw - 12, 12, right)

  // banner
  if (g.banner.t > 0) {
    const a = Math.min(1, g.banner.t)
    ctx.globalAlpha = a
    ctx.textAlign = 'center'
    ctx.font = 'bold 42px ui-monospace, monospace'
    ctx.fillStyle = '#00000066'
    ctx.fillText(g.banner.title, w / 2 + 2, h * 0.3 + 2)
    ctx.fillStyle = '#ffd257'
    ctx.fillText(g.banner.title, w / 2, h * 0.3)
    ctx.font = '16px ui-monospace, monospace'
    ctx.fillStyle = '#e8f1f5'
    ctx.fillText(g.banner.sub, w / 2, h * 0.3 + 30)
    ctx.globalAlpha = 1
  }

  drawToolbar(ctx, g, w, h)
  if (g.tool === 'plant') drawSeedPanel(ctx, g, w)
  if (g.hoverInfo) drawPlantTooltip(ctx, g, w, h)

  if (g.helpOpen) drawHelp(ctx, w, h)
  else if (g.paused && !g.over) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#e8f1f5'
    ctx.textAlign = 'center'
    ctx.font = 'bold 28px ui-monospace, monospace'
    ctx.fillText('paused — P to resume', w / 2, h / 2)
  }
  if (g.over) drawGameOver(ctx, g, w, h, t)
}

function drawToolbar(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const rects = toolbarLayout(w, h)
  const hovered = rects.find(r => g.hoverScreen.x >= r.x && g.hoverScreen.x <= r.x + r.w && g.hoverScreen.y >= r.y && g.hoverScreen.y <= r.y + r.h)

  // tip line
  const tool = TOOLS.find(td => td.tool === (hovered?.tool ?? g.tool))!
  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'center'
  const tipW = ctx.measureText(tool.tip).width + 20
  ctx.fillStyle = 'rgba(4,20,32,0.75)'
  roundRect(ctx, w / 2 - tipW / 2, rects[0].y - 26, tipW, 22, 11)
  ctx.fill()
  ctx.fillStyle = '#cfe3ee'
  ctx.fillText(tool.tip, w / 2, rects[0].y - 10)

  rects.forEach((r, i) => {
    const sel = g.tool === r.tool
    ctx.fillStyle = sel ? 'rgba(35,68,92,0.95)' : 'rgba(4,20,32,0.8)'
    roundRect(ctx, r.x, r.y, r.w, r.h, 9)
    ctx.fill()
    if (sel) {
      ctx.strokeStyle = '#ffd257'
      ctx.lineWidth = 2
      ctx.stroke()
    } else if (hovered === r) {
      ctx.strokeStyle = '#ffffff44'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.font = '22px serif'
    ctx.textAlign = 'center'
    ctx.fillText(TOOLS[i].icon, r.x + r.w / 2, r.y + 30)
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillStyle = '#9fb8c8'
    ctx.fillText(TOOLS[i].name, r.x + r.w / 2, r.y + r.h - 7)
    ctx.fillStyle = '#7d97a8'
    ctx.textAlign = 'left'
    ctx.fillText(String(i + 1), r.x + 5, r.y + 13)
  })
}

function drawSeedPanel(ctx: CanvasRenderingContext2D, g: Game, w: number) {
  const panel = seedPanelRect(w)
  ctx.fillStyle = 'rgba(4,20,32,0.85)'
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 10)
  ctx.fill()
  ctx.fillStyle = '#9fb8c8'
  ctx.font = 'bold 12px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`seed pouch (${g.seeds.length}) · Q/E · wheel`, panel.x + 10, panel.y + 19)

  if (!g.seeds.length) {
    ctx.fillStyle = '#7d97a8'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText('no seeds — breed plants or', panel.x + 10, panel.y + 48)
    ctx.fillText('shoot enemy plants for drops', panel.x + 10, panel.y + 64)
    return
  }

  for (const row of seedRowRects(w, g.seeds.length, g.seedScroll)) {
    const seed = g.seeds[row.idx]
    if (!seed) continue
    const sel = row.idx === g.seedSel
    ctx.fillStyle = sel ? 'rgba(60,96,120,0.9)' : 'rgba(255,255,255,0.05)'
    roundRect(ctx, row.x, row.y, row.w, row.h, 7)
    ctx.fill()
    if (sel) {
      ctx.strokeStyle = '#ffd257'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    const ph = phenoOf(seed.genome)
    ctx.fillStyle = ph.shiny ? '#ffe9a8' : '#e8f1f5'
    ctx.font = 'bold 13px ui-monospace, monospace'
    ctx.fillText(`${ph.shiny ? '✦ ' : ''}${ph.name}`, row.x + 8, row.y + 17)
    ctx.fillStyle = '#8fb3c9'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(symbols(seed.genome), row.x + 8, row.y + 33)
    // generation badge
    const badge = seed.gen === 0 ? 'wild' : `F${seed.gen}`
    ctx.fillStyle = seed.gen === 0 ? '#7d97a8' : '#b8e986'
    ctx.textAlign = 'right'
    ctx.fillText(badge, row.x + row.w - 8, row.y + 17)
    ctx.textAlign = 'left'
  }
  if (g.seeds.length > SEED_VISIBLE) {
    ctx.fillStyle = '#7d97a8'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(`… ${g.seedScroll + SEED_VISIBLE < g.seeds.length ? 'more below' : ''} ${g.seedScroll > 0 ? '· more above' : ''}`, panel.x + 10, panel.y + panel.h - 8)
  }
}

// tiny cache so we don't recompute phenotypes every frame for the seed list
const phenoCache = new WeakMap<Genome, Pheno>()
function phenoOf(g: Genome): Pheno {
  let p = phenoCache.get(g)
  if (!p) {
    p = phenotype(g)
    phenoCache.set(g, p)
  }
  return p
}

function drawPlantTooltip(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const hi = g.hoverInfo!
  const p = hi.plant
  const lines = describe(p.genome)
  const title = `${p.pheno.shiny ? '✦ ' : ''}${p.pheno.name} ${p.gen > 0 ? `· F${p.gen}` : hi.hostile ? '· hostile' : '· wild'}`
  const sub = p.pheno.blurb
  const stat = hi.hostile
    ? `hp ${Math.ceil(p.hp)}/${p.maxHp}`
    : `hp ${Math.ceil(p.hp)}/${p.maxHp} · water ${Math.ceil(p.water)} · ${p.growth >= 1 ? 'mature' : `${Math.floor(p.growth * 100)}% grown`}`

  ctx.font = '12px ui-monospace, monospace'
  const tw = Math.max(
    ctx.measureText(title).width,
    ...lines.map(l => ctx.measureText(l).width),
    ctx.measureText(stat).width
  ) + 24
  const th = 66 + lines.length * 16
  let bx = g.hoverScreen.x + 18
  let by = g.hoverScreen.y - th / 2
  bx = clamp(bx, 8, w - tw - 8)
  by = clamp(by, 8, h - th - 8)

  ctx.fillStyle = 'rgba(4,16,26,0.92)'
  roundRect(ctx, bx, by, tw, th, 9)
  ctx.fill()
  ctx.strokeStyle = hi.hostile ? '#a04545' : '#3c6078'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.fillStyle = p.pheno.shiny ? '#ffe9a8' : '#e8f1f5'
  ctx.font = 'bold 13px ui-monospace, monospace'
  ctx.fillText(title, bx + 12, by + 20)
  ctx.fillStyle = ELEMENT_COLOR[p.pheno.element]
  ctx.font = '11px ui-monospace, monospace'
  ctx.fillText(sub, bx + 12, by + 36)
  ctx.fillStyle = '#8fb3c9'
  lines.forEach((l, i) => ctx.fillText(l, bx + 12, by + 54 + i * 16))
  ctx.fillStyle = '#cfe3ee'
  ctx.fillText(stat, bx + 12, by + 54 + lines.length * 16)
}

function drawHelp(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = 'rgba(2,12,20,0.82)'
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd257'
  ctx.font = 'bold 44px ui-monospace, monospace'
  ctx.fillText('🌱 raftig', w / 2, h * 0.16)
  ctx.fillStyle = '#9fb8c8'
  ctx.font = '15px ui-monospace, monospace'
  ctx.fillText('a raft roguelike where your garden is the gun deck', w / 2, h * 0.16 + 28)

  const lines = [
    'WASD — steer the raft · mouse — use tools (1–7) · P pause · M mute · H this help',
    '',
    'your plants shoot raiders on their own. keep them WATERED or they wilt and die.',
    'sink enemy rafts for wood. burn wood in the BOILER to desalt sea water.',
    'wood also rebuilds and extends your deck. pots + soil drift by — scoop them up.',
    '',
    'BREED (🐝) two mature plants to cross their genes — plantig rules apply:',
    'two alleles per gene, dominant ones mask recessives, and the best traits',
    '(titan damage, hydra barrels, camel thirst, pierce/leech/magnet quirks)',
    'are rare recessives — they hide in carrier lines until the right cross.',
    'shoot enemy plants and they may drop their seed. steal good genes. go wild.',
    '',
    'the run ends when your last plank sinks.',
  ]
  ctx.fillStyle = '#dcebf3'
  ctx.font = '14px ui-monospace, monospace'
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h * 0.3 + i * 22))

  ctx.fillStyle = '#ffd257'
  ctx.font = 'bold 16px ui-monospace, monospace'
  ctx.fillText('— click to set sail —', w / 2, h * 0.3 + lines.length * 22 + 30)
}

function drawGameOver(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number, t: number) {
  ctx.fillStyle = 'rgba(10,4,4,0.72)'
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ff8a65'
  ctx.font = 'bold 44px ui-monospace, monospace'
  ctx.fillText('your raft sank', w / 2, h / 2 - 70)
  ctx.fillStyle = '#e8f1f5'
  ctx.font = '16px ui-monospace, monospace'
  const mins = Math.floor(g.stats.time / 60)
  const secs = Math.floor(g.stats.time % 60)
  ctx.fillText(
    `waves survived: ${g.wave - 1} · rafts sunk: ${g.stats.sunk} · seeds bred: ${g.stats.bred} · ${mins}:${secs.toString().padStart(2, '0')} afloat`,
    w / 2,
    h / 2 - 30
  )
  ctx.fillStyle = '#9fb8c8'
  ctx.font = '14px ui-monospace, monospace'
  ctx.fillText('the sea keeps what it takes — but the genes were the real treasure', w / 2, h / 2 + 2)

  const r = restartRect(w, h)
  const hovered = g.hoverScreen.x >= r.x && g.hoverScreen.x <= r.x + r.w && g.hoverScreen.y >= r.y && g.hoverScreen.y <= r.y + r.h
  ctx.fillStyle = hovered ? 'rgba(60,96,120,0.95)' : 'rgba(35,68,92,0.9)'
  roundRect(ctx, r.x, r.y, r.w, r.h, 10)
  ctx.fill()
  ctx.strokeStyle = '#ffd257'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#ffd257'
  ctx.font = 'bold 16px ui-monospace, monospace'
  ctx.fillText(`drift again (R)`, r.x + r.w / 2, r.y + 28)
}
