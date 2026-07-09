import { Game, TS, RANGE, TILE_HP, FUEL_TIME, FUEL_CAP, FOG_CELL, DANGER_SCALE, Plant, Bullet, EnemyRaft } from './game'
import { describe, symbols, phenotype, Genome, Pheno } from './genetics'
import { TOOLS, toolbarLayout, seedPanelRect, seedRowRects, restartRect, SEED_VISIBLE } from './ui'
import { POI, POI_SIGHT, POI_ICON, POI_COLOR, TRADE_COST, TRADE_RANGE } from './poi'
import { muted } from './audio'
import { Vec, v, hash01, clamp, gkey, dist } from './util'

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
  for (const p of g.activePois) if (p.kind === 'calm') drawCalm(ctx, p, t)
  for (const p of g.activePois) if (p.kind !== 'calm') drawPOI(ctx, g, p, t)
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
  // wind streaks sliding across the swell
  const wx = Math.cos(g.wind.a)
  const wy = Math.sin(g.wind.a)
  const slen = 10 + g.wind.speed * 0.45
  ctx.lineWidth = 1
  for (let gx = x0; gx <= x1; gx++) {
    for (let gy = y0; gy <= y1; gy++) {
      const r = hash01(gx * 3.7 + 11.2, gy * 5.1 + 4.8)
      if (r < 0.72) continue
      const ph = (t * (0.18 + g.wind.speed * 0.01) + r * 9) % 1
      const cx = gx * cell + r * 70 + wx * (ph - 0.5) * cell
      const cy = gy * cell + hash01(gy * 2.3, gx * 1.7) * 70 + wy * (ph - 0.5) * cell
      // the swell goes glassy inside becalmed pools
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.13 * g.calmAt(v(cx, cy))
      ctx.beginPath()
      ctx.moveTo(cx - wx * slen * 0.5, cy - wy * slen * 0.5)
      ctx.lineTo(cx + wx * slen * 0.5, cy + wy * slen * 0.5)
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
  // mast & sail on the plank nearest the raft's heart (empty deck preferred)
  let mast: Vec | null = null
  let best = Infinity
  for (const tile of g.tiles.values()) {
    const p = g.tilePos(tile)
    const score = (p.x - g.cam.x) ** 2 + (p.y - g.cam.y) ** 2 + (tile.structure ? 1e6 : 0)
    if (score < best) {
      best = score
      mast = p
    }
  }
  if (mast) drawSail(ctx, g, mast, t)
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
        // fixed firing heading — faint always, bright while the 🎯 tool is up
        if (s.plant.growth >= 1) {
          const aiming = g.tool === 'aim'
          const selected = aiming && g.aimFirst === gkey(tile.gx, tile.gy)
          drawAim(ctx, p.x, p.y - 12, s.plant.aim, aiming, selected, t)
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

  // aim heading preview to cursor
  if (g.tool === 'aim' && g.aimFirst) {
    const ft = g.tiles.get(g.aimFirst)
    if (ft) {
      const fp = g.tilePos(ft)
      ctx.strokeStyle = '#ffd257aa'
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

/** short arrow from a plant showing where it will fire */
function drawAim(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  toolActive: boolean,
  selected: boolean,
  t: number,
  rgb = '255,210,87',
) {
  const len = toolActive ? 26 : 16
  const alpha = selected ? 0.6 + 0.4 * Math.sin(t * 6) : toolActive ? 0.55 : 0.22
  const ex = x + Math.cos(angle) * len
  const ey = y + Math.sin(angle) * len
  ctx.strokeStyle = `rgba(${rgb},${alpha})`
  ctx.lineWidth = selected ? 2.5 : 1.5
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  const ah = 5
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - Math.cos(angle - 0.4) * ah, ey - Math.sin(angle - 0.4) * ah)
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - Math.cos(angle + 0.4) * ah, ey - Math.sin(angle + 0.4) * ah)
  ctx.stroke()
  if (selected) {
    ctx.beginPath()
    ctx.arc(x, y, 20, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawSail(ctx: CanvasRenderingContext2D, g: Game, mp: Vec, t: number) {
  const a = g.wind.a
  const stretch = g.sailEff ?? 0.55
  const boom = 20 + g.wind.speed * 0.18
  const tipX = mp.x + Math.cos(a) * boom
  const tipY = mp.y + Math.sin(a) * boom
  const px = -Math.sin(a)
  const py = Math.cos(a)
  const bulge = (7 + g.wind.speed * 0.1) * (0.6 + 0.4 * stretch) + Math.sin(t * 3.1) * 1.2
  const midX = (mp.x + tipX) / 2
  const midY = (mp.y + tipY) / 2
  ctx.fillStyle = 'rgba(238,229,205,0.93)'
  ctx.strokeStyle = '#b9ac8a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(mp.x, mp.y)
  ctx.quadraticCurveTo(midX + px * bulge, midY + py * bulge, tipX, tipY)
  ctx.quadraticCurveTo(midX + px * bulge * 0.25, midY + py * bulge * 0.25, mp.x, mp.y)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#5f4830'
  ctx.beginPath()
  ctx.arc(mp.x, mp.y, 3.5, 0, Math.PI * 2)
  ctx.fill()
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
    // fixed gun mounts, ship-cannon style — the red arrow is the firing line
    drawAim(ctx, p.x, p.y - 12, tile.plant.aim, e.mode === 'hunt', false, t, '255,105,90')
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
  let cx = 0
  let cy = 0
  for (const tile of e.tiles) {
    cx += tile.gx
    cy += tile.gy
  }
  const n = Math.max(1, e.tiles.length)
  const hx = e.pos.x + (cx / n) * TS
  const hy = e.pos.y + (cy / n) * TS
  // harriers fly a red pennant — the fast ones that row through any wind
  if (e.kind === 'harrier') {
    ctx.strokeStyle = '#33271b'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(e.pos.x, e.pos.y - 6)
    ctx.lineTo(e.pos.x, e.pos.y - 34)
    ctx.stroke()
    const flap = Math.sin(t * 7) * 3
    ctx.fillStyle = '#d84343'
    ctx.beginPath()
    ctx.moveTo(e.pos.x, e.pos.y - 34)
    ctx.lineTo(e.pos.x + 17, e.pos.y - 30 + flap)
    ctx.lineTo(e.pos.x, e.pos.y - 25)
    ctx.closePath()
    ctx.fill()
  }
  if (e.tiles.length && e.mode !== 'roam') {
    ctx.font = '15px serif'
    ctx.textAlign = 'center'
    if (e.mode === 'notice') {
      // wondering — back off now and they lose interest
      ctx.fillStyle = '#ffd257'
      ctx.font = 'bold 17px ui-monospace, monospace'
      ctx.fillText('?', hx, hy - TS * 0.95 + Math.sin(t * 8) * 2)
    } else {
      ctx.fillText('⚔️', hx, hy - TS * 0.95 + Math.sin(t * 5) * 2)
    }
  }
}

// ---------- points of interest ----------

function drawCalm(ctx: CanvasRenderingContext2D, p: POI, t: number) {
  ctx.fillStyle = 'rgba(190,225,255,0.05)'
  ctx.beginPath()
  ctx.arc(p.pos.x, p.pos.y, p.r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(190,225,255,0.1)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  // glassy glints on the dead water
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 7; i++) {
    const a = hash01(i * 3.3, p.pos.x) * Math.PI * 2
    const d = hash01(i * 7.1, p.pos.y) * p.r * 0.8
    ctx.globalAlpha = 0.05 + 0.05 * Math.sin(t * 0.7 + i * 2)
    ctx.beginPath()
    ctx.ellipse(p.pos.x + Math.cos(a) * d, p.pos.y + Math.sin(a) * d, 9, 2.5, a, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawPOI(ctx: CanvasRenderingContext2D, g: Game, p: POI, t: number) {
  if (p.kind === 'wreck') drawWreck(ctx, p, t)
  else if (p.kind === 'nest') drawNest(ctx, p, t)
  else if (p.kind === 'trader') drawTrader(ctx, g, p, t)
}

const WRECK_PLANKS = [
  { dx: 0, dy: 0, a: 0.15 },
  { dx: 40, dy: 18, a: -0.3 },
  { dx: -34, dy: 24, a: 0.45 },
  { dx: 14, dy: -30, a: -0.1 },
]

function drawWreck(ctx: CanvasRenderingContext2D, p: POI, t: number) {
  ctx.globalAlpha = p.done ? 0.45 : 0.9
  for (const pl of WRECK_PLANKS) {
    const x = p.pos.x + pl.dx
    const y = p.pos.y + pl.dy
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(pl.a)
    ctx.fillStyle = '#3a2f24'
    roundRect(ctx, -TS / 2 + 4, -TS / 2 + 10, TS - 8, TS - 20, 4)
    ctx.fill()
    ctx.strokeStyle = '#241c14'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
    // waterline sheen — half sunk
    ctx.fillStyle = 'rgba(13,74,111,0.5)'
    ctx.beginPath()
    ctx.ellipse(x, y + 8, TS * 0.55, 6, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // snapped mast
  ctx.strokeStyle = p.done ? '#3a2f24' : '#4a3b2c'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(p.pos.x - 4, p.pos.y)
  ctx.lineTo(p.pos.x + 14, p.pos.y - 34)
  ctx.stroke()
  ctx.globalAlpha = 1
  // smoke column while there's still salvage aboard
  if (!p.done) {
    ctx.fillStyle = '#9aa7ad'
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.35 + i / 4) % 1
      ctx.globalAlpha = (1 - ph) * 0.3
      const sx = p.pos.x + 14 + Math.sin(t * 0.8 + i * 2.2) * (6 + ph * 14)
      ctx.beginPath()
      ctx.arc(sx, p.pos.y - 40 - ph * 85, 5 + ph * 12, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}

function drawNest(ctx: CanvasRenderingContext2D, p: POI, t: number) {
  const x = p.pos.x
  const y = p.pos.y
  // anchored platform
  ctx.fillStyle = '#4f3d2c'
  roundRect(ctx, x - 20, y - 14, 40, 28, 5)
  ctx.fill()
  ctx.strokeStyle = '#33271b'
  ctx.lineWidth = 2
  ctx.stroke()
  // totem spar with a raider banner
  ctx.strokeStyle = '#33271b'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.moveTo(x, y - 8)
  ctx.lineTo(x, y - 52)
  ctx.stroke()
  const wave = p.done ? 2 : Math.sin(t * 3) * 5
  ctx.fillStyle = p.done ? '#5a5a5a' : '#a03030'
  ctx.beginPath()
  ctx.moveTo(x, y - 52)
  ctx.quadraticCurveTo(x + 14, y - 48 + wave * 0.5, x + 26, y - 46 + wave)
  ctx.lineTo(x + 24, y - 38 + wave)
  ctx.quadraticCurveTo(x + 12, y - 40 + wave * 0.5, x, y - 40)
  ctx.closePath()
  ctx.fill()
  ctx.font = '13px serif'
  ctx.textAlign = 'center'
  ctx.globalAlpha = p.done ? 0.5 : 1
  ctx.fillText('☠️', x + 13, y - 41 + wave * 0.6)
  ctx.globalAlpha = 1
}

function drawTrader(ctx: CanvasRenderingContext2D, g: Game, p: POI, t: number) {
  const bob = Math.sin(t * 1.4 + p.pos.x) * 2
  const x = p.pos.x
  const y = p.pos.y + bob
  drawPlank(ctx, x - TS / 2, y, TILE_HP, TILE_HP, false, 0)
  drawPlank(ctx, x + TS / 2, y, TILE_HP, TILE_HP, false, 0)
  // green-dyed sail — peaceful colors
  ctx.strokeStyle = '#5f4830'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x - TS / 2, y)
  ctx.lineTo(x - TS / 2, y - 44)
  ctx.stroke()
  ctx.fillStyle = 'rgba(140,200,140,0.9)'
  ctx.strokeStyle = '#4e7a50'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x - TS / 2, y - 42)
  ctx.quadraticCurveTo(x + 8, y - 34 + Math.sin(t * 2.6) * 2, x + 22, y - 22)
  ctx.quadraticCurveTo(x + 2, y - 24, x - TS / 2, y - 12)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // lantern
  ctx.font = '15px serif'
  ctx.textAlign = 'center'
  ctx.fillText('🏮', x + TS / 2, y - 20 + Math.sin(t * 2) * 2)
  // barter prompt when you're alongside
  const d = dist(p.pos, g.cam)
  if (d < TRADE_RANGE + 70) {
    const near = d < TRADE_RANGE
    ctx.font = 'bold 12px ui-monospace, monospace'
    const label = p.done ? 'sold out — fair winds' : `T · ${TRADE_COST}🪵 → 🌰 (${p.stock} left)`
    const lw = ctx.measureText(label).width + 16
    ctx.fillStyle = 'rgba(4,20,32,0.8)'
    roundRect(ctx, x - lw / 2, y - 98, lw, 20, 10)
    ctx.fill()
    ctx.fillStyle = p.done ? '#9fb8c8' : near ? '#b8e986' : '#7d97a8'
    ctx.fillText(label, x, y - 84)
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

  // sea status
  const mins = Math.floor(g.stats.time / 60)
  const secs = Math.floor(g.stats.time % 60)
  const hunting = g.enemies.filter(e => e.mode === 'hunt').length
  const danger = g.dangerAt(g.cam)
  const seaName = danger < 2 ? 'home waters' : danger < 4 ? 'open sea' : danger < 6 ? 'raider seas' : 'deadly waters'
  const status = hunting
    ? `⚔️ ${hunting} raider${hunting === 1 ? '' : 's'} engaging!`
    : `${seaName} · danger ${danger.toFixed(1)} · ${g.enemies.length} sail${g.enemies.length === 1 ? '' : 's'} near`
  ctx.font = 'bold 15px ui-monospace, monospace'
  const sw = ctx.measureText(status).width + 24
  ctx.fillStyle = hunting ? 'rgba(80,16,16,0.8)' : 'rgba(4,20,32,0.75)'
  roundRect(ctx, w / 2 - sw / 2, 12, sw, 28, 14)
  ctx.fill()
  ctx.fillStyle = '#e8f1f5'
  ctx.textAlign = 'center'
  ctx.fillText(status, w / 2, 31)

  drawWindPill(ctx, g, w)
  if (!g.over) drawPOIMarkers(ctx, g, w, h)
  drawMinimap(ctx, g, h)

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

function drawWindPill(ctx: CanvasRenderingContext2D, g: Game, w: number) {
  const y = 46
  const label = `${Math.round(g.wind.speed)} kn`
  ctx.font = '13px ui-monospace, monospace'
  const pw = ctx.measureText(label).width + 52
  const x0 = w / 2 - pw / 2
  ctx.fillStyle = 'rgba(4,20,32,0.75)'
  roundRect(ctx, x0, y, pw, 24, 12)
  ctx.fill()
  // arrow points where the wind blows; color = how well your heading catches it
  const eff = g.sailEff
  const color = eff == null ? '#cfe3ee' : `hsl(${Math.round(((eff - 0.3) / 0.7) * 120)}, 75%, 62%)`
  ctx.save()
  ctx.translate(x0 + 18, y + 12)
  ctx.rotate(g.wind.a)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-7, 0)
  ctx.lineTo(4, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(9, 0)
  ctx.lineTo(2, -4.5)
  ctx.lineTo(2, 4.5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = '#cfe3ee'
  ctx.textAlign = 'left'
  ctx.fillText(label, x0 + 32, y + 17)
}

/** edge-of-screen markers for sights on the horizon — a reason to pick a heading */
function drawPOIMarkers(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const inset = 38
  for (const p of g.activePois) {
    if (p.done) continue
    const d = dist(p.pos, g.cam)
    if (d > POI_SIGHT[p.kind]) continue
    const sx = p.pos.x - g.cam.x + w / 2
    const sy = p.pos.y - g.cam.y + h / 2
    if (sx > -20 && sx < w + 20 && sy > -20 && sy < h + 20) continue // on screen already
    // clamp toward the screen edge along the sightline
    const dx = sx - w / 2
    const dy = sy - h / 2
    const tx = dx !== 0 ? (w / 2 - inset) / Math.abs(dx) : Infinity
    const ty = dy !== 0 ? (h / 2 - inset) / Math.abs(dy) : Infinity
    const k = Math.min(tx, ty)
    const px = w / 2 + dx * k
    let py = h / 2 + dy * k
    // keep markers clear of the status pills, toolbar, and minimap (incl. its label)
    py = clamp(py, 86, h - (px < 210 ? 232 : 128))
    ctx.globalAlpha = p.kind === 'calm' ? 0.6 : 0.9
    ctx.fillStyle = 'rgba(4,20,32,0.8)'
    ctx.beginPath()
    ctx.arc(px, py, 15, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = POI_COLOR[p.kind]
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.font = '13px serif'
    ctx.textAlign = 'center'
    ctx.fillText(POI_ICON[p.kind], px, py + 4.5)
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillStyle = POI_COLOR[p.kind]
    ctx.fillText(`${(d / 100).toFixed(1)}lg`, px, py + 27)
    ctx.globalAlpha = 1
  }
}

// ---------- minimap ----------

const MAP_S = 160
const MAP_SCALE = 0.028 // world px → map px (~5.7k px across)

function drawMinimap(ctx: CanvasRenderingContext2D, g: Game, h: number) {
  const x0 = 12
  const y0 = h - MAP_S - 12
  const mcx = x0 + MAP_S / 2
  const mcy = y0 + MAP_S / 2
  const toMap = (p: Vec) => v(mcx + (p.x - g.cam.x) * MAP_SCALE, mcy + (p.y - g.cam.y) * MAP_SCALE)

  ctx.save()
  roundRect(ctx, x0, y0, MAP_S, MAP_S, 10)
  ctx.fillStyle = 'rgba(3,14,22,0.85)'
  ctx.fill()
  ctx.clip()

  // charted waters — travel reveals the map
  const half = MAP_S / 2 / MAP_SCALE
  const g0x = Math.floor((g.cam.x - half) / FOG_CELL)
  const g1x = Math.floor((g.cam.x + half) / FOG_CELL)
  const g0y = Math.floor((g.cam.y - half) / FOG_CELL)
  const g1y = Math.floor((g.cam.y + half) / FOG_CELL)
  const cs = FOG_CELL * MAP_SCALE
  ctx.fillStyle = 'rgba(90,140,165,0.22)'
  for (let gx = g0x; gx <= g1x; gx++) {
    for (let gy = g0y; gy <= g1y; gy++) {
      if (!g.seen.has(gkey(gx, gy))) continue
      const m = toMap(v(gx * FOG_CELL, gy * FOG_CELL))
      ctx.fillRect(m.x, m.y, cs + 0.5, cs + 0.5)
    }
  }

  // danger rings around home — the gradient you're gambling against
  const home = toMap(v(0, 0))
  for (let k = 1; k <= 9; k++) {
    ctx.strokeStyle = `rgba(255,110,110,${0.05 + k * 0.012})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(home.x, home.y, k * DANGER_SCALE * 2 * MAP_SCALE, 0, Math.PI * 2)
    ctx.stroke()
  }

  // discovered sights
  for (const p of g.pois.values()) {
    if (!p || !p.discovered) continue
    const m = toMap(p.pos)
    if (m.x < x0 - 12 || m.x > x0 + MAP_S + 12 || m.y < y0 - 12 || m.y > y0 + MAP_S + 12) continue
    ctx.globalAlpha = p.done ? 0.3 : 1
    if (p.kind === 'calm') {
      ctx.strokeStyle = POI_COLOR.calm
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(m.x, m.y, p.r * MAP_SCALE, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.fillStyle = POI_COLOR[p.kind]
      ctx.beginPath()
      ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // sails in sight; hunters blink
  for (const e of g.enemies) {
    const d = dist(e.pos, g.cam)
    if (e.mode === 'roam' && d > 1500) continue
    const m = toMap(e.pos)
    if (e.mode === 'hunt' || e.mode === 'notice') {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(g.time * 8)
      ctx.fillStyle = e.mode === 'hunt' ? '#ff5252' : '#ffd257'
    } else {
      ctx.fillStyle = 'rgba(255,160,140,0.7)'
    }
    ctx.beginPath()
    ctx.arc(m.x, m.y, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // home marker — clamped to the rim when far afield, your compass back
  const margin = 10
  const hx = clamp(home.x, x0 + margin, x0 + MAP_S - margin)
  const hy = clamp(home.y, y0 + margin, y0 + MAP_S - margin)
  ctx.fillStyle = '#ffd257'
  ctx.font = 'bold 11px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('⌂', hx, hy + 4)

  // you, pointing where you're going
  const a = Math.hypot(g.raft.vel.x, g.raft.vel.y) > 4 ? Math.atan2(g.raft.vel.y, g.raft.vel.x) : g.wind.a
  ctx.save()
  ctx.translate(mcx, mcy)
  ctx.rotate(a)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(5, 0)
  ctx.lineTo(-3.5, -3.2)
  ctx.lineTo(-3.5, 3.2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.restore()
  roundRect(ctx, x0, y0, MAP_S, MAP_S, 10)
  ctx.strokeStyle = 'rgba(120,160,180,0.4)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // bearing home
  const dHome = dist(g.cam, v(0, 0))
  ctx.fillStyle = '#9fb8c8'
  ctx.font = '11px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`⌂ ${(dHome / 100).toFixed(1)} leagues`, x0 + 2, y0 - 6)
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
    'WASD — sail · mouse — tools (1–8) · T — trade · P pause · M mute · H this help',
    '',
    'mind the WIND (arrow up top): running with it is fast, beating into it is a crawl.',
    'the MINIMAP (bottom left) charts where you sail; ⌂ points the way home.',
    '',
    'sights dot the horizon: ⚓ smoking wrecks (fat salvage) · 🏮 traders (🪵 → seeds)',
    '🌀 becalmed pools (rich flotsam, dead sails) · ☠️ raider nests (the wildest genes).',
    '',
    'raiders eye you first (❓) — back away and they lose interest; linger and it\'s ⚔️.',
    'waking one raft stirs its podmates, so pick where you engage.',
    'fleeing works, but they patch their hulls while you run — commit, or eat the loss.',
    'red-pennant HARRIERS row through any wind: sink them or lose them in a gale.',
    'raider guns are fixed mounts too — red arrows mark their firing lines;',
    'they must sail to bring one to bear, so stay off the lines and rake them.',
    'the farther from home, the deadlier the sea — and the richer everything it holds.',
    '',
    'plants auto-fire along a FIXED heading — aim each with the 🎯 tool out of combat.',
    'keep them WATERED or they wilt and die',
    "(they gulp water in battle, only sip at rest). kill a raft's last plant",
    'and the crew scuttles — every plank is yours. the BOILER desalts: 1🪵 → 2💧.',
    'BREED (🐝) two mature plants to cross genes — dominant alleles mask recessives,',
    'and the best traits hide in carrier lines until the right cross.',
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
    `rafts sunk: ${g.stats.sunk} · seeds bred: ${g.stats.bred} · farthest ${(g.stats.far / 100).toFixed(1)} leagues · ${mins}:${secs.toString().padStart(2, '0')} afloat`,
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
