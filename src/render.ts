import { Game, TS, RANGE, SPLASH, WARD_ARC, TIERS, FOG_CELL, DANGER_SCALE, ENEMY_WAKE_S, Plant, Bullet, EnemyShip, seaName } from './game'
import { describe, phenotype, Genome, Pheno, alleleDef } from './genetics'
import { TOOLS, toolbarLayout, seedPanelRect, seedRowRects, restartRect, SEED_VISIBLE, boardLayout, BoardChip } from './ui'
import { synergies, picksCost, DOCK_RANGE } from './breeding'
import { POI, POI_SIGHT, POI_ICON, POI_COLOR, TRADE_COST, TRADE_RANGE, BREED_COST } from './poi'
import { muted } from './audio'
import { Vec, v, hash01, clamp, gkey, dist, waveHeight } from './util'

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

  // sea — the water itself darkens and sours as the danger bands deepen,
  // so "how far out am I" reads off the horizon, not just the HUD number
  const deep = clamp((g.dangerAt(g.cam) - 1) / 9, 0, 1)
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, mixColor('#0d4a6f', '#3d1f4a', deep))
  grad.addColorStop(1, mixColor('#072a40', '#1a0c24', deep))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  const shakeX = g.shake > 0.1 ? (Math.random() - 0.5) * g.shake : 0
  const shakeY = g.shake > 0.1 ? (Math.random() - 0.5) * g.shake : 0
  // the world never sits perfectly still — a slow, low-amplitude sway even at
  // a standstill, separate from the sharp hit-triggered shake above
  const swayX = Math.sin(t * 0.35) * 1.2
  const swayY = Math.sin(t * 0.27 + 1.7) * 1.2

  ctx.save()
  // the camera pulls back (zoom < 1) and leads the bow at speed — see g.camZoom /
  // g.camLead. Zoom around screen centre, then place the (lead-shifted) hull
  ctx.translate(w / 2, h / 2)
  ctx.scale(g.camZoom, g.camZoom)
  ctx.translate(-g.cam.x + shakeX + swayX - g.camLead.x, -g.cam.y + shakeY + swayY - g.camLead.y)

  drawWaves(ctx, g, w, h, t)
  drawWake(ctx, g.shipTrail, g.tierDef().beam, t)
  // every moving hull trails its own wake — a lighter, shorter, haze-less LOD
  // version so a full fleet stays cheap (bastions sit still and carry no trail)
  for (const e of g.enemies) if (e.trail) drawWake(ctx, e.trail, e.r * 0.7, t, ENEMY_WAKE)
  drawSpeedStreaks(ctx, g)
  for (const p of g.activePois) if (p.kind === 'calm') drawCalm(ctx, p, t)
  for (const p of g.activePois) if (p.kind !== 'calm') drawPOI(ctx, g, p, t)
  for (const l of g.loot) drawLoot(ctx, l.pos, l.kind, l.phase, l.ttl)
  for (const e of g.enemies) drawEnemyShip(ctx, g, e, t)
  drawPlayerShip(ctx, g, t)
  for (const b of g.bullets) drawBullet(ctx, g, b)
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // floating texts — damage numbers carry their own size (big blows, big type)
  ctx.textAlign = 'center'
  for (const ft of g.texts) {
    ctx.font = `bold ${ft.size ?? 13}px ui-monospace, monospace`
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
  // gentle swell crests dotting the sea — little arcs of foam beads rather than
  // stroked wire, stippled the same way (and same foam colour) as the wake so
  // the whole surface reads as churn. Positions are hash-fixed per cell and just
  // bob on a slow sine, so the beads drift with the swell without shimmering
  ctx.fillStyle = '#eaf6fa'
  for (let gx = x0; gx <= x1; gx++) {
    for (let gy = y0; gy <= y1; gy++) {
      const r = hash01(gx, gy)
      if (r > 0.55) continue
      const x = gx * cell + r * 60
      const y = gy * cell + hash01(gy, gx) * 60 + Math.sin(t * 1.3 + r * 12) * 3
      const rad = 7 + r * 8
      const pulse = 0.07 + 0.05 * Math.sin(t * 0.9 + r * 20)
      const beads = 4 + Math.floor(r * 4) // 4–6 beads tracing the crest
      for (let s = 0; s < beads; s++) {
        const a = Math.PI * 0.15 + Math.PI * 0.7 * (s / (beads - 1))
        const hj = hash01(gx * 7.1 + s * 3.3, gy * 5.7 + s * 1.9)
        const hj2 = hash01(gy * 2.3 + s * 4.1, gx * 3.9 + s * 2.7)
        ctx.globalAlpha = Math.max(0, pulse * (0.55 + 0.75 * hj))
        ctx.beginPath()
        ctx.arc(x + Math.cos(a) * rad + (hj - 0.5) * 3, y + Math.sin(a) * rad + (hj2 - 0.5) * 3, 0.6 + hj * 1.1, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  // wind streaks sliding across the swell — a few foam dabs strung along the
  // wind rather than a drawn line, so they match the beaded swell yet still
  // read as a streak pointing downwind
  const wx = Math.cos(g.wind.a)
  const wy = Math.sin(g.wind.a)
  const slen = 10 + g.wind.speed * 0.45
  for (let gx = x0; gx <= x1; gx++) {
    for (let gy = y0; gy <= y1; gy++) {
      const r = hash01(gx * 3.7 + 11.2, gy * 5.1 + 4.8)
      if (r < 0.72) continue
      const ph = (t * (0.18 + g.wind.speed * 0.01) + r * 9) % 1
      const cx = gx * cell + r * 70 + wx * (ph - 0.5) * cell
      const cy = gy * cell + hash01(gy * 2.3, gx * 1.7) * 70 + wy * (ph - 0.5) * cell
      // the swell goes glassy inside becalmed pools
      const a = Math.sin(ph * Math.PI) * 0.15 * g.calmAt(v(cx, cy))
      if (a <= 0.002) continue
      for (let s = 0; s < 3; s++) {
        const f = s / 2 - 0.5 // -0.5..0.5 along the streak
        const hj = hash01(gx * 5.3 + s * 6.1, gy * 4.7 + s * 2.9)
        ctx.globalAlpha = a * (0.7 + 0.5 * hj)
        ctx.beginPath()
        ctx.arc(cx + wx * slen * f, cy + wy * slen * f, 0.5 + hj * 0.8, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.globalAlpha = 1
}

/** foam streaks that rush past the hull as way comes on — a sense-of-speed cue,
 *  not real foam. Hash-placed on a fixed world grid so each sits still in the
 *  water and streams past as the ship drives through, but only in a close band
 *  hugging the hull (not the whole screen). Raked backward along the EASED travel
 *  direction (camLead), so they don't snap around when the hull turns. Fade in
 *  past ~80px/s and out at the band's inner and outer rim. */
function drawSpeedStreaks(ctx: CanvasRenderingContext2D, g: Game) {
  const sp = Math.hypot(g.ship.vel.x, g.ship.vel.y)
  const s01 = Math.max(0, Math.min(1, (sp - 80) / 150)) // in from ~80, full by ~230
  const lead = Math.hypot(g.camLead.x, g.camLead.y)
  if (s01 <= 0 || lead < 1) return
  const vx = g.camLead.x / lead // eased heading — lags turns smoothly, no snap
  const vy = g.camLead.y / lead
  const cx = g.ship.pos.x
  const cy = g.ship.pos.y
  const cell = 58
  const inner = 78 // clear of the hull
  const R = 300 // a close band, not the whole view
  const gx0 = Math.floor((cx - R) / cell)
  const gx1 = Math.floor((cx + R) / cell)
  const gy0 = Math.floor((cy - R) / cell)
  const gy1 = Math.floor((cy + R) / cell)
  ctx.strokeStyle = '#e6f3fa'
  ctx.lineCap = 'round'
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      const h1 = hash01(gx, gy)
      if (h1 > 0.5) continue // ~half the cells carry a streak
      const px = gx * cell + h1 * cell
      const py = gy * cell + hash01(gy, gx) * cell
      const d = Math.hypot(px - cx, py - cy)
      if (d < inner || d > R) continue
      const band = Math.min(1, (d - inner) / 40) * Math.min(1, (R - d) / 90) // fade at both rims
      const len = (16 + 44 * s01) * (0.6 + 0.5 * hash01(gx * 1.7, gy * 1.3))
      ctx.globalAlpha = s01 * band * 0.16 * (0.6 + 0.4 * hash01(gx * 2.3, gy * 0.7))
      ctx.lineWidth = 1 + s01 * 0.6
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px - vx * len, py - vy * len) // rake backward along the eased course
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
}

/** draw a wake straight off a hull's recent course `trail` (each entry a fixed
 *  {x,y,vx,vy,t} the hull left behind), so it never gaps and curves through
 *  turns. Built like a real boat wake rather than two drawn lines: the bright
 *  cusp "edges" are a feather of short diagonal crest barbs stamped en echelon
 *  along the ~19.5° Kelvin envelope, the interior is soft transverse crest arcs
 *  (the V's), and both sit in a haze of foam flecks. Every mark is jittered by a
 *  hash of its own fixed water position, so it reads as churn — not vector art —
 *  and stays put as the hull sails on. Shared by the player and the enemy fleet:
 *  `opts.haze:false` drops the dense (and priciest) fleck layer and `opts.win`
 *  shortens the trail span, for cheap LOD wakes on the AI ships. */
const WAKE_TAN_HALF_ANGLE = 0.354 // tan(~19.5°), the real Kelvin wake half-angle
// enemy hulls get a cheap wake: no foam haze, a short trail, a touch dimmer
const ENEMY_WAKE = { win: ENEMY_WAKE_S, haze: false, amp: 0.9 }
function drawWake(
  ctx: CanvasRenderingContext2D,
  trail: { x: number; y: number; vx: number; vy: number; t: number }[],
  beam: number,
  time: number,
  opts: { win?: number; haze?: boolean; amp?: number } = {},
) {
  if (trail.length < 2) return
  const win = opts.win ?? 1.5 // seconds of course the wake spans and fades over
  const amp = opts.amp ?? 1 // overall opacity — enemies ride a touch dimmer
  const haze = opts.haze ?? true // the dense foam-fleck layer; off for LOD wakes

  ctx.lineCap = 'round'

  // how far off the centerline each side sits at a trail point — grows with
  // how long ago the hull was there, opening the shallow V behind it
  const offAt = (spd: number, age: number) => beam * 0.4 + spd * age * WAKE_TAN_HALF_ANGLE

  // 1. divergent feather: short diagonal crest "barbs" stamped along each cusp
  //    envelope, overlapping en echelon so the edge reads as a run of wavelets
  //    rather than one continuous stroke. Each barb hangs inward-and-forward
  //    off its envelope point and lengthens down-wake, like real divergent waves
  ctx.strokeStyle = '#eaf6fa'
  const BARB_SLICE = 0.045 // course between barbs — dense enough to feather
  for (const side of [-1, 1]) {
    let lastBucket = NaN
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i]
      const age = time - p.t
      if (age > win) break
      const spd = Math.hypot(p.vx, p.vy)
      if (spd < 25) continue
      // pin one barb per fixed course slice (not per fixed age) so each stays
      // put in the water as the hull sails on, instead of dancing every frame
      const bucket = Math.floor(p.t / BARB_SLICE)
      if (bucket === lastBucket) continue
      lastBucket = bucket
      const fade = (1 - age / win) * Math.min(1, age / 0.12) // ease in at the stern
      const off = offAt(spd, age)
      const h = Math.atan2(p.vy, p.vx)
      const nx = -Math.sin(h) * side
      const ny = Math.cos(h) * side // outward normal on this side
      const fx = Math.cos(h)
      const fy = Math.sin(h) // toward the bow
      const j = hash01(p.x * 0.8, p.y * 0.8)
      const j2 = hash01(p.y * 0.7 + 3.1, p.x * 0.7 + 1.9)
      const ex = p.x + nx * off // envelope (outer) point of the barb
      const ey = p.y + ny * off
      const len = 8 + off * 0.14 + j * 7 // barbs grow longer down-wake
      const blend = 0.55 + j2 * 0.4 // how sharply the barb rakes forward
      let dx = -nx * (1 - blend) + fx * blend // inward + forward
      let dy = -ny * (1 - blend) + fy * blend
      const dn = Math.hypot(dx, dy) || 1
      dx /= dn
      dy /= dn
      ctx.globalAlpha = amp * fade * (0.2 + 0.2 * j2)
      ctx.lineWidth = 1.1 + j * 0.9
      ctx.beginPath()
      ctx.moveTo(ex + (j - 0.5) * 2, ey + (j2 - 0.5) * 2)
      ctx.lineTo(ex + dx * len, ey + dy * len)
      ctx.stroke()
    }
  }

  // 2. transverse crests: the "V's" filling the wake, bowing toward the bow —
  //    beaded foam arcs, not wires. Each crest is pinned to a fixed slice of
  //    the ship's course (so it sits still in the water as she sails on) and
  //    every trait is hash-jittered per slice — some slices skipped for uneven
  //    gaps, camber and brightness varied, apex leaned off-centre, beads broken
  //    up — so the run of crests reads irregular and churny, not evenly ribbed
  ctx.fillStyle = '#eaf6fa'
  const SLICE = 0.13 // avg seconds of course between crests
  let lastBucket = NaN
  for (let i = trail.length - 1; i >= 0; i--) {
    const p = trail[i]
    const age = time - p.t
    if (age > win) break
    const spd = Math.hypot(p.vx, p.vy)
    if (spd < 25) continue
    const bucket = Math.floor(p.t / SLICE)
    if (bucket === lastBucket) continue
    lastBucket = bucket
    const hb = hash01(bucket * 12.9 + 4.7, bucket * 3.3)
    if (hb < 0.28) continue // skip some slices → uneven gaps between crests
    const hb2 = hash01(bucket * 5.1, bucket * 8.7 + 1.3)
    const fade = (1 - age / win) * Math.min(1, age / 0.16) // ease in at the stern, out down-wake
    const off = offAt(spd, age)
    const h = Math.atan2(p.vy, p.vx)
    const px = -Math.sin(h)
    const py = Math.cos(h)
    const fx = Math.cos(h)
    const fy = Math.sin(h)
    const bow = off * (0.4 + hb * 0.5) // camber varies crest to crest
    const skew = (hb2 - 0.5) * 0.5 * off // apex leans off-centre
    const ax = p.x + px * off
    const ay = p.y + py * off // one cusp
    const rx = p.x - px * off
    const ry = p.y - py * off // the other cusp
    const cx = p.x + fx * bow + px * skew
    const cy = p.y + fy * bow + py * skew // control point, cambered and skewed
    const beads = Math.max(5, Math.round(off / 6))
    const bright = 0.09 + hb2 * 0.12
    for (let s = 1; s < beads; s++) {
      const hx = hash01(bucket * 91 + s * 12.7, s * 4.3)
      const hy = hash01(s * 7.9 + 2.3, bucket * 53 + s * 3.1)
      if (hx < 0.28) continue // drop beads unevenly → a broken, gappy crest
      const t = s / beads
      const u = 1 - t
      const qx = u * u * ax + 2 * u * t * cx + t * t * rx
      const qy = u * u * ay + 2 * u * t * cy + t * t * ry
      ctx.globalAlpha = Math.max(0, amp * fade * bright * (0.6 + hy))
      ctx.beginPath()
      ctx.arc(qx + (hx - 0.5) * 6, qy + (hy - 0.5) * 6, 0.5 + hy * 1.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 3. foam haze: dim flecks scattered across the wake, brighter toward the
  //    cusps and the churning stern — the noise that sells it as water. This is
  //    the priciest layer (a bead per trail point), so LOD wakes skip it
  if (haze) {
    ctx.fillStyle = '#f2fbff'
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i]
      const spd = Math.hypot(p.vx, p.vy)
      if (spd < 25) continue
      const age = time - p.t
      const fade = 1 - age / win
      if (fade <= 0) continue
      const off = offAt(spd, age)
      const h = Math.atan2(p.vy, p.vx)
      const px = -Math.sin(h)
      const py = Math.cos(h)
      for (let k = 0; k < 5; k++) {
        const hx = hash01(p.x * 1.9 + k * 21.3, p.y * 1.7 - k * 9.1)
        const hy = hash01(p.y * 2.3 - k * 6.7, p.x * 1.3 + k * 8.9)
        const lat = hx * 2 - 1 // -1..1 across the width
        const x = p.x + px * lat * off + (hy - 0.5) * 4
        const y = p.y + py * lat * off + (hy - 0.5) * 4
        ctx.globalAlpha = amp * fade * (0.06 + 0.14 * Math.abs(lat)) * (0.7 + 0.3 * fade)
        ctx.beginPath()
        ctx.arc(x, y, 0.6 + hy * 1.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
}

function drawLoot(ctx: CanvasRenderingContext2D, pos: Vec, kind: string, phase: number, ttl: number) {
  const icons: Record<string, string> = { wood: '🪵', seed: '🌰', water: '💧', pollen: '🌼' }
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

/** lerp two hex colors — health reads straight off the foliage */
function mixColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t)
  return `rgb(${ch((pa >> 16) & 255, (pb >> 16) & 255)},${ch((pa >> 8) & 255, (pb >> 8) & 255)},${ch(pa & 255, pb & 255)})`
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, p: Plant, hostile: boolean, t: number) {
  const dry = !hostile && p.water <= 0
  // health IS the pose: a hurt plant browns hard, droops deep, sways loose, and
  // the flower sheds petals one by one — the head is the hp gauge, no bar needed
  const hpFrac = Math.max(0, Math.min(1, p.hp / p.maxHp))
  const hurt = 1 - hpFrac
  const wiltC = Math.min(1, hurt * 1.15)
  const sway = Math.sin(t * 2 + p.wobble) * (2 + hurt * 3.5) + (dry ? 4 : 0)
  const stemH = 24 - hurt * 10
  const headX = x + sway
  const headY = y - 6 - stemH

  ctx.strokeStyle = mixColor(dry ? '#8b7d5a' : hostile ? '#5c7a3e' : '#3e8a50', '#6b5233', wiltC)
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(x, y - 4)
  ctx.quadraticCurveTo(x + sway * 0.4, y - 6 - stemH * 0.5, headX, headY)
  ctx.stroke()

  // leaves — thinning and folding as the stem fails
  ctx.fillStyle = mixColor(dry ? '#9b8b62' : hostile ? '#6d8f4a' : '#4e9a5f', '#8a693d', wiltC)
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(x + side * 6 + sway * 0.3, y - 8 - stemH * 0.4, 6 - hurt * 2, 3 - hurt * 1.6, side * (0.5 + hurt * 0.9), 0, Math.PI * 2)
    ctx.fill()
  }

  // flower head — colored by element; petals drop with hp (5 healthy → 1 dying)
  const color = dry ? '#a89d80' : ELEMENT_COLOR[p.pheno.element]
  const r = 6.5
  const petals = Math.max(1, Math.ceil(5 * hpFrac))
  ctx.globalAlpha = 0.55 + 0.45 * hpFrac
  ctx.fillStyle = color
  for (let i = 0; i < petals; i++) {
    const a = (i / 5) * Math.PI * 2 + t * 0.2 + p.wobble
    ctx.beginPath()
    ctx.arc(headX + Math.cos(a) * r * 0.8, headY + Math.sin(a) * r * 0.8, r * 0.55, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = hostile ? '#3a2a2a' : '#fff8e1'
  ctx.beginPath()
  ctx.arc(headX, headY, r * 0.45, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // fresh hit: the whole head flashes white for a frame or two
  if (p.flashT > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.7 * Math.min(1, p.flashT / 0.09)})`
    ctx.beginPath()
    ctx.arc(headX, headY, r + 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // reload gauge (our guns only) — manual fire means the crew reloads between
  // volleys: an amber arc winds up as it reloads, a dim green ring = loaded & ready
  if (!hostile && !dry) {
    const rr = r + 5
    if (p.cooldown > 0) {
      const loaded = 1 - Math.min(1, p.cooldown / p.pheno.period)
      ctx.strokeStyle = 'rgba(255,209,87,0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(headX, headY, rr, -Math.PI / 2, -Math.PI / 2 + loaded * Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.strokeStyle = 'rgba(150,225,130,0.55)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(headX, headY, rr, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // shiny sparkle for expressed rare alleles (plantig homage)
  if (p.pheno.shiny) {
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

/** trace the boat outline at the local origin — pointed prow at +x, rounded stern */
function hullPath(ctx: CanvasRenderingContext2D, len: number, beam: number) {
  ctx.beginPath()
  ctx.moveTo(len, 0)
  ctx.quadraticCurveTo(len * 0.55, -beam, len * 0.1, -beam)
  ctx.lineTo(-len * 0.7, -beam)
  ctx.quadraticCurveTo(-len, -beam * 0.85, -len, 0)
  ctx.quadraticCurveTo(-len, beam * 0.85, -len * 0.7, beam)
  ctx.lineTo(len * 0.1, beam)
  ctx.quadraticCurveTo(len * 0.55, beam, len, 0)
  ctx.closePath()
}

/** one solid hull — damage darkens her, fire licks the deck, a fresh hit
 *  flashes her white for a frame or two. Caller rotates the ctx */
function drawHull(ctx: CanvasRenderingContext2D, len: number, beam: number, frac: number, hostile: boolean, burnT: number, flash = 0) {
  hullPath(ctx, len, beam)
  ctx.fillStyle = hostile ? '#4f3d2c' : '#8a6a45'
  ctx.fill()
  ctx.strokeStyle = hostile ? '#33271b' : '#5f4830'
  ctx.lineWidth = 3
  ctx.stroke()
  // deck plank seams, lengthwise
  ctx.strokeStyle = '#00000022'
  ctx.lineWidth = 1
  for (let i = -2; i <= 2; i++) {
    const yy = (i / 3) * beam
    ctx.beginPath()
    ctx.moveTo(-len * 0.85, yy)
    ctx.lineTo(len * (0.9 - Math.abs(i) * 0.18), yy)
    ctx.stroke()
  }
  if (frac < 0.999) {
    hullPath(ctx, len, beam)
    ctx.fillStyle = `rgba(20,10,5,${(1 - frac) * 0.5})`
    ctx.fill()
  }
  if (frac < 0.55) {
    ctx.strokeStyle = '#00000055'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-len * 0.3, -beam * 0.6)
    ctx.lineTo(len * 0.05, beam * 0.1)
    ctx.lineTo(-len * 0.15, beam * 0.7)
    ctx.stroke()
  }
  if (burnT > 0) {
    hullPath(ctx, len, beam)
    ctx.fillStyle = `rgba(255,120,40,${0.22 + 0.13 * Math.sin(burnT * 20)})`
    ctx.fill()
  }
  if (flash > 0) {
    hullPath(ctx, len, beam)
    ctx.fillStyle = `rgba(255,255,255,${0.65 * Math.min(1, flash)})`
    ctx.fill()
  }
}

/** slim hp sliver over a damaged hull — the precise read the tooltip used to hoard */
function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number) {
  const f = Math.max(0, Math.min(1, frac))
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  roundRect(ctx, x - w / 2, y, w, 4, 2)
  ctx.fill()
  ctx.fillStyle = f > 0.5 ? '#8fd07a' : f > 0.25 ? '#ffd257' : '#ff6e5a'
  roundRect(ctx, x - w / 2 + 0.5, y + 0.5, Math.max(1.5, (w - 1) * f), 3, 1.5)
  ctx.fill()
}

function drawPlayerShip(ctx: CanvasRenderingContext2D, g: Game, t: number) {
  const tier = g.tierDef()
  // rides the swell — hull, sail and every mounted gun bob together (one
  // outer offset) while the hull silhouette alone gets a touch of roll, since
  // the guns' own positions are computed in world space and shouldn't chase it
  const bob = waveHeight(g.ship.pos.x, g.ship.pos.y, t) * 3
  const tilt = waveHeight(g.ship.pos.x * 1.3, g.ship.pos.y * 1.3, t * 0.8 + 50) * 0.045
  ctx.save()
  ctx.translate(0, bob)
  // hull layer turns with the heading; sprites above stay upright at their
  // (rotated) mount positions so flowers and bars remain readable
  ctx.save()
  ctx.translate(g.ship.pos.x, g.ship.pos.y)
  ctx.rotate(g.ship.a + tilt)
  drawHull(ctx, tier.len, tier.beam, g.ship.hp / tier.hull, false, g.burnT, g.hullFlashT / 0.09)
  // empty mount sockets read as places to sow
  for (const m of g.mounts) {
    ctx.fillStyle = m.plant ? '#00000018' : '#00000033'
    ctx.beginPath()
    ctx.arc(m.x, m.y, 13, 0, Math.PI * 2)
    ctx.fill()
    if (!m.plant) {
      ctx.strokeStyle = '#ffffff22'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
  ctx.restore()

  // mast amidships
  drawSail(ctx, g, g.ship.pos, t)

  g.mounts.forEach((m, i) => {
    const p = g.mountPos(m)
    const plant = m.plant
    if (!plant) return
    drawPot(ctx, p.x, p.y)
    // burst ring: where this mortar's shells come down — gold when loaded, faint
    // while the crew reloads. The helm walks it; the reach gene sets the distance
    // and Z/X (battery elevation) pull it in short of that.
    const a = g.ship.a + plant.aim
    const reach = g.plantRange(plant)
    if (plant.pheno.quirk === 'ward') {
      // a ward doesn't bombard: its telegraph is the shield arc it can swat
      // shells out of, not a drop ring
      drawWardArc(ctx, p.x, p.y, reach, a, plant.cooldown <= 0 && plant.water > 0, t)
      if (g.tool === 'trim') drawAim(ctx, p.x, p.y - 12, a, true, g.trimSel === m, t)
    } else {
      drawAim(ctx, p.x, p.y - 12, a, g.tool === 'trim', g.trimSel === m, t)
      drawDropRing(
        ctx,
        p.x + Math.cos(a) * reach,
        p.y + Math.sin(a) * reach,
        g.plantSplash(plant),
        plant.cooldown <= 0 && plant.water > 0,
        t
      )
    }
    // muzzle recoil: the sprite kicks back along -aim as a volley leaves
    const rec = plant.recoilT > 0 ? (plant.recoilT / 0.12) * 3 : 0
    drawPlant(ctx, p.x - Math.cos(a) * rec, p.y - Math.sin(a) * rec, plant, false, t)
    drawWaterBar(ctx, p.x, p.y, plant)
    // armed to dig: a pulsing ring so a half-finished click reads as a warning,
    // not a silent no-op, before the confirming second click lands
    if (g.pendingDig === m) {
      ctx.strokeStyle = `rgba(255,157,92,${0.5 + 0.4 * Math.sin(t * 10)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.x, p.y - 6, 20, 0, Math.PI * 2)
      ctx.stroke()
    }
  })

  // below half hull she wears her own bar — the HUD chip is easy to miss mid-fight
  const hullFrac = g.ship.hp / tier.hull
  if (hullFrac < 0.5 && !g.over) drawHpBar(ctx, g.ship.pos.x, g.ship.pos.y - tier.len - 12, tier.len * 1.2, hullFrac)

  // hovering a plant → show its full genetic reach (theirs too — know the sniper)
  const hi = g.hoverInfo
  if (hi) {
    ctx.fillStyle = hi.hostile ? 'rgba(255,110,90,0.05)' : 'rgba(255,255,255,0.04)'
    ctx.beginPath()
    ctx.arc(hi.pos.x, hi.pos.y, hi.plant.pheno.range, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = hi.hostile ? 'rgba(255,110,90,0.2)' : 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  ctx.restore()
}

/** the ring a mortar's shells burst on — gold ones you walk over raiders,
 *  red ones you keep your hull out from under */
function drawDropRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  ready: boolean,
  t: number,
  rgb = '255,210,87',
) {
  ctx.strokeStyle = ready ? `rgba(${rgb},${0.5 + 0.2 * Math.sin(t * 5)})` : `rgba(${rgb},0.16)`
  ctx.lineWidth = ready ? 1.8 : 1.2
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = ready ? `rgba(${rgb},0.75)` : `rgba(${rgb},0.25)`
  ctx.beginPath()
  ctx.arc(x, y, 2.2, 0, Math.PI * 2)
  ctx.fill()
}

/** a ward plant's shield arc — the slice of sky it can swat shells out of.
 *  Icy, so it reads as defense next to the gold/red drop rings */
function drawWardArc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, ready: boolean, t: number) {
  ctx.strokeStyle = ready ? `rgba(191,227,242,${0.4 + 0.2 * Math.sin(t * 5)})` : 'rgba(191,227,242,0.14)'
  ctx.lineWidth = ready ? 2 : 1.2
  ctx.setLineDash([4, 7])
  ctx.beginPath()
  ctx.arc(x, y, r, a - WARD_ARC, a + WARD_ARC)
  ctx.stroke()
  ctx.setLineDash([])
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

function drawEnemyShip(ctx: CanvasRenderingContext2D, g: Game, e: EnemyShip, t: number) {
  // the hive garrison is battlements, not a boat: a wax-brick ring on the island
  if (e.kind === 'bastion') {
    const frac0 = e.hp / e.maxHp
    ctx.fillStyle = `rgba(120,90,34,${0.55 + 0.4 * frac0})`
    ctx.strokeStyle = e.mode === 'hunt' ? '#ff9d5c' : '#8a6f3a'
    ctx.lineWidth = 4
    ctx.beginPath()
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const hx = e.pos.x + Math.cos(a) * e.r * 0.9
      const hy = e.pos.y + Math.sin(a) * e.r * 0.62
      i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // crenellations catch the light while the walls stand
    ctx.fillStyle = '#ffd257'
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6
      ctx.beginPath()
      ctx.arc(e.pos.x + Math.cos(a) * e.r * 0.9, e.pos.y + Math.sin(a) * e.r * 0.62, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const gun of e.guns) {
      const p = g.gunPos(e, gun)
      drawPot(ctx, p.x, p.y)
      const a = gun.plant.aim
      // fortress gunners range in: the ring sits at the cranked elevation
      const rr = gun.plant.pheno.range * (gun.plant.elev ?? 1)
      if (gun.plant.pheno.quirk === 'ward') {
        drawWardArc(ctx, p.x, p.y, rr, a, gun.plant.cooldown <= 0, t)
      } else {
        drawAim(ctx, p.x, p.y - 12, a, false, false, t, '255,105,90')
        drawDropRing(ctx, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, SPLASH, gun.plant.cooldown <= 0, t, '255,105,90')
      }
      const rec = gun.plant.recoilT > 0 ? (gun.plant.recoilT / 0.12) * 3 : 0
    drawPlant(ctx, p.x - Math.cos(a) * rec, p.y - Math.sin(a) * rec, gun.plant, true, t)
    }
    if (e.hp < e.maxHp) drawHpBar(ctx, e.pos.x, e.pos.y - e.r - 8, e.r * 1.4, frac0)
    if (e.mode === 'hunt') {
      ctx.font = '15px serif'
      ctx.textAlign = 'center'
      ctx.fillText('⚔️', e.pos.x, e.pos.y - e.r - 18 + Math.sin(t * 5) * 2)
    }
    return
  }
  // rides the swell same as the player hull — one outer bob for everything
  // drawn at this ship's position, a touch of roll on the hull sprite alone
  const bob = waveHeight(e.pos.x, e.pos.y, t) * 3
  const tilt = waveHeight(e.pos.x * 1.3, e.pos.y * 1.3, t * 0.8 + 50) * 0.045
  ctx.save()
  ctx.translate(0, bob)
  // the hull sprite noses along its wake — cosmetic; the guns are world-fixed
  const ha = Math.atan2(e.vel.y, e.vel.x)
  ctx.save()
  ctx.translate(e.pos.x, e.pos.y)
  ctx.rotate(ha + tilt)
  const frac = e.hp / e.maxHp
  // class silhouettes: sloops run slim and long, galleons broad with a gilded
  // sterncastle, fireships low with braziers alight; raiders keep the stock hull
  if (e.kind === 'sloop') {
    drawHull(ctx, e.r * 1.45, e.r * 0.55, frac, true, e.burnT, (e.flashT ?? 0) / 0.09)
    // a fore-and-aft sail amidships — the cut that lets her flee any brawl
    ctx.fillStyle = 'rgba(238,229,205,0.85)'
    ctx.beginPath()
    ctx.moveTo(e.r * 0.95, 0)
    ctx.quadraticCurveTo(e.r * 0.1, -e.r * 0.42, -e.r * 0.55, 0)
    ctx.quadraticCurveTo(e.r * 0.1, e.r * 0.12, e.r * 0.95, 0)
    ctx.fill()
  } else if (e.kind === 'galleon') {
    drawHull(ctx, e.r * 1.25, e.r * 0.95, frac, true, e.burnT, (e.flashT ?? 0) / 0.09)
    // sterncastle and gold strakes — money and menace
    ctx.fillStyle = '#3a2c1e'
    roundRect(ctx, -e.r * 0.95, -e.r * 0.5, e.r * 0.55, e.r, 3)
    ctx.fill()
    ctx.strokeStyle = '#c9a24b'
    ctx.lineWidth = 2
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(-e.r * 0.85, side * e.r * 0.6)
      ctx.lineTo(e.r * 0.75, side * e.r * 0.36)
      ctx.stroke()
    }
  } else if (e.kind === 'fireship') {
    drawHull(ctx, e.r * 1.1, e.r * 0.7, frac, true, e.burnT, (e.flashT ?? 0) / 0.09)
    // plating rims the hull: bronze takes two normal hits, iron three
    if (e.armor) {
      hullPath(ctx, e.r * 1.1, e.r * 0.7)
      ctx.strokeStyle = e.armor === 2 ? '#a7b2bc' : '#c08a4a'
      ctx.lineWidth = 2.5
      ctx.stroke()
    }
    // braziers banked along the deck, ready to blow
    for (const bx of [-0.5, 0, 0.5]) {
      ctx.fillStyle = `rgba(255,176,87,${0.7 + 0.3 * Math.sin(t * 9 + bx * 5)})`
      ctx.beginPath()
      ctx.arc(bx * e.r, 0, 3.2, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (e.kind === 'mortar') {
    // low and broad — a gun-barge built to sit still and take hits, not run
    drawHull(ctx, e.r * 1.05, e.r * 1.05, frac, true, e.burnT, (e.flashT ?? 0) / 0.09)
    // a squat brass turret amidships — the "it's cranking elevation" tell
    ctx.fillStyle = '#5a4a30'
    ctx.beginPath()
    ctx.arc(0, 0, e.r * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#c9a24b'
    ctx.lineWidth = 2
    ctx.stroke()
  } else {
    drawHull(ctx, e.r * 1.2, e.r * 0.8, frac, true, e.burnT, (e.flashT ?? 0) / 0.09)
  }
  ctx.restore()
  // the fireship's glow reads at a distance — sink it before it closes
  if (e.kind === 'fireship') {
    ctx.fillStyle = `rgba(255,140,66,${0.1 + 0.06 * Math.sin(t * 11)})`
    ctx.beginPath()
    ctx.arc(e.pos.x, e.pos.y, e.r + 9, 0, Math.PI * 2)
    ctx.fill()
  }
  if (e.chillT > 0) {
    ctx.fillStyle = 'rgba(127,216,255,0.14)'
    ctx.beginPath()
    ctx.arc(e.pos.x, e.pos.y, e.r, 0, Math.PI * 2)
    ctx.fill()
  }
  // pressing: a red flare rings the hull while it charges to knife range —
  // the telegraph that says answer with the helm, not the anchor
  if ((e.pressT ?? 0) > 0) {
    ctx.strokeStyle = `rgba(255,110,90,${0.32 + 0.26 * Math.sin(t * 9)})`
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(e.pos.x, e.pos.y, e.r + 7, 0, Math.PI * 2)
    ctx.stroke()
  }
  // stung by hive artillery: this hull pays no salvage until its crew patches up
  if (e.beeHit) {
    ctx.font = '12px serif'
    ctx.textAlign = 'center'
    ctx.fillText('🐝', e.pos.x + e.r * 0.8, e.pos.y - e.r - 8 + Math.sin(t * 6) * 1.5)
  }
  for (const gun of e.guns) {
    const p = g.gunPos(e, gun)
    drawPot(ctx, p.x, p.y)
    // raider mortars play by your rules: the red ring is where this gun's shells
    // burst — bright when a hunting gun is loaded, faint while it reloads or roams.
    // A gun that ranges in (mortars, like bastions) has its ring pulled short of
    // full reach by its cranked elevation; plain hunters fire at the capped reach
    // (just inside your own) so the ring shows exactly where the shell will land
    const a = gun.plant.aim
    const rr = gun.plant.elev != null ? gun.plant.pheno.range * gun.plant.elev : g.enemyReach(gun.plant, e.danger)
    if (gun.plant.pheno.quirk === 'ward') {
      drawWardArc(ctx, p.x, p.y, gun.plant.pheno.range * (gun.plant.elev ?? 1), a, e.mode !== 'roam' && gun.plant.cooldown <= 0, t)
    } else {
      drawAim(ctx, p.x, p.y - 12, a, false, false, t, '255,105,90')
      drawDropRing(ctx, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, SPLASH, e.mode === 'hunt' && gun.plant.cooldown <= 0, t, '255,105,90')
    }
    const rec = gun.plant.recoilT > 0 ? (gun.plant.recoilT / 0.12) * 3 : 0
    drawPlant(ctx, p.x - Math.cos(a) * rec, p.y - Math.sin(a) * rec, gun.plant, true, t)
  }
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
  // hull bar: only once she's marked you AND taken damage — roamers keep a clean horizon
  if (e.mode !== 'roam' && e.hp < e.maxHp) drawHpBar(ctx, e.pos.x, e.pos.y - e.r - 8, e.r * 1.6, e.hp / e.maxHp)
  if (e.mode !== 'roam') {
    ctx.font = '15px serif'
    ctx.textAlign = 'center'
    if (e.mode === 'notice') {
      // wondering — back off now and they lose interest
      ctx.fillStyle = '#ffd257'
      ctx.font = 'bold 17px ui-monospace, monospace'
      ctx.fillText('?', e.pos.x, e.pos.y - e.r - 14 + Math.sin(t * 8) * 2)
    } else {
      ctx.fillText('⚔️', e.pos.x, e.pos.y - e.r - 14 + Math.sin(t * 5) * 2)
    }
  }
  ctx.restore()
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
  else if (p.kind === 'port') drawPort(ctx, g, p, t)
  else if (p.kind === 'breeder') drawBreeder(ctx, g, p, t)
  else if (p.kind === 'hive') drawHive(ctx, g, p, t)
}

/** a bee fortress island: honeycomb walls around a hive dome. Neutral hives
 *  parley (F) and pay bounties; fired-upon hives man the walls */
function drawHive(ctx: CanvasRenderingContext2D, g: Game, p: POI, t: number) {
  const x = p.pos.x
  const y = p.pos.y
  const angry = !p.done && (p.hostile || g.beesAngry)
  // the island
  ctx.fillStyle = '#c7a86e'
  ctx.beginPath()
  ctx.ellipse(x, y + 8, 74, 42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#9c854f'
  ctx.beginPath()
  ctx.ellipse(x, y + 4, 56, 30, 0, 0, Math.PI * 2)
  ctx.fill()
  // honeycomb rampart — a hex ring of wax-brick
  ctx.strokeStyle = p.done ? '#6e5a35' : '#8a6f3a'
  ctx.fillStyle = p.done ? 'rgba(90,74,44,0.8)' : 'rgba(176,138,58,0.9)'
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    const hx = x + Math.cos(a) * 40
    const hy = y + Math.sin(a) * 26
    i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // the hive dome
  ctx.fillStyle = p.done ? '#7a6a48' : '#d9a83f'
  ctx.beginPath()
  ctx.ellipse(x, y - 10, 22, 20, 0, Math.PI, 0)
  ctx.fill()
  ctx.strokeStyle = p.done ? '#5d5038' : '#a87c22'
  ctx.lineWidth = 2
  for (const dy of [-22, -16, -10, -4]) {
    ctx.beginPath()
    ctx.moveTo(x - Math.sqrt(Math.max(0, 1 - ((dy + 10) / 20) ** 2)) * 22, y + dy)
    ctx.lineTo(x + Math.sqrt(Math.max(0, 1 - ((dy + 10) / 20) ** 2)) * 22, y + dy)
    ctx.stroke()
  }
  if (p.done) {
    // broken: a crack and no bees
    ctx.strokeStyle = '#2e2618'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 6, y - 28)
    ctx.lineTo(x + 2, y - 14)
    ctx.lineTo(x - 4, y - 2)
    ctx.stroke()
  } else {
    // the swarm: drifting gold motes, agitated and red-tinged when angry
    for (let i = 0; i < 7; i++) {
      const ph = t * (angry ? 3.2 : 1.4) + i * 1.7
      ctx.fillStyle = angry && i % 2 ? '#ff9d5c' : '#ffd257'
      ctx.beginPath()
      ctx.arc(x + Math.cos(ph + i) * (26 + (i % 3) * 9), y - 14 + Math.sin(ph * 1.3) * 12, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // dock prompt when alongside a hive that will still talk to you — a live
  // grudge (not open war) still talks, just to sue for peace instead of trade
  const d = dist(p.pos, g.cam)
  const grudge = !p.done && p.hostile && !g.beesAngry
  if (!p.done && !g.beesAngry && d < p.r + 220) {
    const near = d < p.r + 130
    ctx.font = 'bold 12px ui-monospace, monospace'
    const label = grudge
      ? `T · make peace (${g.peaceTribute(p)}🌼)`
      : g.contract
        ? `F · breed (${BREED_COST}🌼) · T · bounty ${g.contract.got}/${g.contract.need}`
        : `F · breed (${BREED_COST}🌼) · T · bounty`
    const lw = ctx.measureText(label).width + 16
    ctx.fillStyle = 'rgba(4,20,32,0.8)'
    roundRect(ctx, x - lw / 2, y - 118, lw, 20, 10)
    ctx.fill()
    ctx.fillStyle = grudge ? '#ff9d5c' : near ? '#ffd257' : '#7d97a8'
    ctx.textAlign = 'center'
    ctx.fillText(label, x, y - 104)
  }
}

/** a small harbour: the reliable place to dock (F) and cross your lines */
function drawPort(ctx: CanvasRenderingContext2D, g: Game, p: POI, t: number) {
  const x = p.pos.x
  const y = p.pos.y
  // a spit of land
  ctx.fillStyle = '#c7a86e'
  ctx.beginPath()
  ctx.ellipse(x, y + 6, 46, 26, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#8f7a4a'
  ctx.beginPath()
  ctx.ellipse(x, y + 2, 30, 15, 0, 0, Math.PI * 2)
  ctx.fill()
  // a couple of jetty posts + a lantern
  ctx.strokeStyle = '#5f4a2c'
  ctx.lineWidth = 3
  for (const dx of [-16, 16]) {
    ctx.beginPath()
    ctx.moveTo(x + dx, y - 2)
    ctx.lineTo(x + dx, y - 22)
    ctx.stroke()
  }
  ctx.font = '15px serif'
  ctx.textAlign = 'center'
  ctx.fillText('🏝️', x, y - 24 + Math.sin(t * 1.6) * 1.5)
  drawDockPrompt(ctx, g, p, x, y, 'port')
}

/** the wandering breeder boat — a blossom-sailed sloop; dock for a premium cross */
function drawBreeder(ctx: CanvasRenderingContext2D, g: Game, p: POI, t: number) {
  const bob = Math.sin(t * 1.5 + p.pos.x) * 2
  const x = p.pos.x
  const y = p.pos.y + bob
  drawPlank(ctx, x - TS / 2, y, 1, 1, false, 0)
  drawPlank(ctx, x + TS / 2, y, 1, 1, false, 0)
  ctx.strokeStyle = '#5f4830'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x - TS / 2, y)
  ctx.lineTo(x - TS / 2, y - 46)
  ctx.stroke()
  // pink blossom sail
  ctx.fillStyle = 'rgba(244,166,208,0.92)'
  ctx.strokeStyle = '#c76fa0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x - TS / 2, y - 44)
  ctx.quadraticCurveTo(x + 10, y - 34 + Math.sin(t * 2.4) * 2, x + 24, y - 22)
  ctx.quadraticCurveTo(x + 2, y - 24, x - TS / 2, y - 12)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.font = '15px serif'
  ctx.textAlign = 'center'
  ctx.fillText('🐝', x + TS / 2, y - 20 + Math.sin(t * 2) * 2)
  drawDockPrompt(ctx, g, p, x, y, 'breeder')
}

/** the "F · breed" prompt shown when the ship is alongside a port/breeder */
function drawDockPrompt(ctx: CanvasRenderingContext2D, g: Game, p: POI, x: number, y: number, kind: 'port' | 'breeder') {
  const d = dist(p.pos, g.cam)
  if (d > DOCK_RANGE + 90) return
  const near = d < DOCK_RANGE
  ctx.font = 'bold 12px ui-monospace, monospace'
  const label = kind === 'breeder' ? `F · breeder cross (${BREED_COST}🌼, premium)` : `F · breed here (${BREED_COST}🌼)`
  const lw = ctx.measureText(label).width + 16
  ctx.fillStyle = 'rgba(4,20,32,0.8)'
  roundRect(ctx, x - lw / 2, y - 100, lw, 20, 10)
  ctx.fill()
  ctx.fillStyle = near ? (kind === 'breeder' ? '#f4a6d0' : '#e6c88f') : '#7d97a8'
  ctx.textAlign = 'center'
  ctx.fillText(label, x, y - 86)
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
  drawPlank(ctx, x - TS / 2, y, 1, 1, false, 0)
  drawPlank(ctx, x + TS / 2, y, 1, 1, false, 0)
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

/** a mortar shell in flight: the shadow tracks the sea while the shell rides
 *  the arc, and the burst ring sharpens as it comes down */
function drawBullet(ctx: CanvasRenderingContext2D, g: Game, b: Bullet) {
  const color = g.bulletColor(b)
  const r = clamp(2.5 + b.dmg * 0.12, 2.5, 5)
  const prog = clamp(1 - b.life / b.flightT, 0, 1)
  const hgt = (26 + b.flightT * 16) * 4 * prog * (1 - prog)
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.15 + 0.3 * prog
  ctx.setLineDash([4, 5])
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(b.drop.x, b.drop.y, b.splash, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 0.2
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(b.pos.x, b.pos.y + 2, 5, 2.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(b.pos.x, b.pos.y - hgt, r, 0, Math.PI * 2)
  ctx.fill()
  if (!b.friendly) {
    ctx.strokeStyle = '#00000055'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

// ---------- HUD ----------

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, accent?: string): number {
  ctx.font = '14px ui-monospace, monospace'
  const w = ctx.measureText(text).width + 18
  ctx.fillStyle = accent ? 'rgba(58,42,8,0.85)' : 'rgba(4,20,32,0.75)'
  roundRect(ctx, x, y, w, 26, 13)
  ctx.fill()
  if (accent) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5
    roundRect(ctx, x, y, w, 26, 13)
    ctx.stroke()
  }
  ctx.fillStyle = accent ?? '#e8f1f5'
  ctx.textAlign = 'left'
  ctx.fillText(text, x + 9, y + 18)
  return w
}

function drawHud(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number, t: number) {
  // low-hull alarm: a red vignette breathes at the screen edge under a quarter
  // hull, paired with the heartbeat sfx — the ⚠ chip alone was easy to miss
  const alarmFrac = g.ship.hp / g.tierDef().hull
  if (!g.over && alarmFrac < 0.25) {
    const a = 0.14 + 0.22 * (1 - alarmFrac / 0.25) + 0.08 * Math.sin(t * 4.5)
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.36, w / 2, h / 2, Math.max(w, h) * 0.6)
    vg.addColorStop(0, 'rgba(160,20,20,0)')
    vg.addColorStop(1, `rgba(160,20,20,${Math.max(0, a)})`)
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, w, h)
  }
  // resources
  let x = 12
  x += chip(ctx, x, 12, `🪵 ${g.wood}`) + 6
  x += chip(ctx, x, 12, `💧 ${g.water}`) + 6
  x += chip(ctx, x, 12, `🌰 ${g.seeds.length}`) + 6
  x += chip(ctx, x, 12, `🌼 ${g.pollen}`) + 6
  // the standing bee bounty — the pollen income you're sailing for
  if (g.contract) x += chip(ctx, x, 12, `🐝 ${g.contract.got}/${g.contract.need} → ${g.contract.pay}🌼`, '#ffd257') + 6
  if (g.chillT > 0) chip(ctx, x, 12, '❄ chilled!')

  // the ship herself: hull, next refit, the galley stove
  const tier = g.tierDef()
  const low = g.ship.hp < tier.hull * 0.3
  let x2 = 12
  x2 += chip(ctx, x2, 44, `${low ? '⚠ ' : ''}⛵ ${tier.name} ${Math.ceil(g.ship.hp)}/${tier.hull}`) + 6
  const next = TIERS[g.tier + 1]
  if (next) x2 += chip(ctx, x2, 44, `U refit → ${next.name} (${next.cost}🪵)`) + 6
  chip(ctx, x2, 44, 'B boil 1🪵→2💧')

  // sea status
  const mins = Math.floor(g.stats.time / 60)
  const secs = Math.floor(g.stats.time % 60)
  const hunting = g.enemies.filter(e => e.mode === 'hunt').length
  const danger = g.dangerAt(g.cam)
  const status = hunting
    ? `⚔️ ${hunting} raider${hunting === 1 ? '' : 's'} engaging!`
    : `${seaName(danger)} · danger ${danger.toFixed(1)} · ${g.enemies.length} sail${g.enemies.length === 1 ? '' : 's'} near`
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
  if (!g.over) drawBeacon(ctx, g, w, h)
  drawMinimap(ctx, g, h)

  // right chips
  ctx.font = '14px ui-monospace, monospace'
  const right = `☠ ${g.stats.sunk} · ${mins}:${secs.toString().padStart(2, '0')}${muted ? ' · 🔇' : ''}`
  const rw = ctx.measureText(right).width + 18
  chip(ctx, w - rw - 12, 12, right)
  // battery elevation — blue while the guns are cranked short of full reach
  const elevTxt = `Z/X range ${Math.round(g.elev * 100)}%`
  const ew = ctx.measureText(elevTxt).width + 18
  chip(ctx, w - ew - 12, 44, elevTxt, g.elev < 0.995 ? '#7fd8ff' : undefined)
  // manual fire: reminder chip under it (the gunnery corner), lit gold when a
  // loaded gun has a target — the old centre spot collided with the wind pill
  const ready = g.mounts.some(m => m.plant && m.plant.water > 0 && m.plant.cooldown <= 0)
  const litFire = ready && g.inCombat() && 0.5 + 0.5 * Math.sin(t * 6) > 0.35
  const fireTxt = '␣ fire · A/D+␣ rail'
  const fw = ctx.measureText(fireTxt).width + 18
  chip(ctx, w - fw - 12, 76, fireTxt, litFire ? '#ffd257' : undefined)

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
  if (g.hoverInfo && !g.board) drawPlantTooltip(ctx, g, w, h)
  if (g.board) drawBoard(ctx, g, w, h)

  if (g.helpOpen) drawHelp(ctx, g, w, h)
  else if (g.paused && !g.over) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#e8f1f5'
    ctx.textAlign = 'center'
    ctx.font = 'bold 28px ui-monospace, monospace'
    ctx.fillText('paused — P or Esc to resume', w / 2, h / 2 - 40)
    ctx.fillStyle = '#9fb8c8'
    ctx.font = '14px ui-monospace, monospace'
    CONTROL_LINES.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + i * 22))
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
    if (p.done || p === g.beacon) continue // the beacon draws its own gold marker
    const d = dist(p.pos, g.cam)
    if (d > POI_SIGHT[p.kind]) continue
    const sx = (p.pos.x - g.cam.x - g.camLead.x) * g.camZoom + w / 2
    const sy = (p.pos.y - g.cam.y - g.camLead.y) * g.camZoom + h / 2
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

/** the swarm's progression pointer: a gold compass badge riding the screen edge
 *  toward the richer hive it marked (g.beacon), from any distance, so the pollen
 *  trail always has a heading. Softens to a pulsing ring once its waters are on
 *  screen; the hive sprite and its own POI marker carry it from there. */
function drawBeacon(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const b = g.beacon
  if (!b || b.done) return
  const sx = (b.pos.x - g.cam.x - g.camLead.x) * g.camZoom + w / 2
  const sy = (b.pos.y - g.cam.y - g.camLead.y) * g.camZoom + h / 2
  const d = dist(b.pos, g.ship.pos)
  const pulse = 0.7 + 0.3 * Math.sin(g.time * 4)
  if (sx > 44 && sx < w - 44 && sy > 44 && sy < h - 44) {
    // its waters are on screen — a soft ring to pick it out, no edge badge
    ctx.strokeStyle = `rgba(255,210,87,${0.25 + 0.2 * Math.sin(g.time * 4)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(sx, sy, 24 + 3 * Math.sin(g.time * 4), 0, Math.PI * 2)
    ctx.stroke()
    return
  }
  // clamp to the screen edge along the sightline, clear of the HUD furniture
  const inset = 52
  const dx = sx - w / 2
  const dy = sy - h / 2
  const tx = dx !== 0 ? (w / 2 - inset) / Math.abs(dx) : Infinity
  const ty = dy !== 0 ? (h / 2 - inset) / Math.abs(dy) : Infinity
  const k = Math.min(tx, ty)
  const px = w / 2 + dx * k
  const py = clamp(h / 2 + dy * k, 92, h - (w / 2 + dx * k < 220 ? 240 : 120))
  const ang = Math.atan2(dy, dx)
  ctx.globalAlpha = pulse
  ctx.fillStyle = 'rgba(4,20,32,0.85)'
  ctx.beginPath()
  ctx.arc(px, py, 17, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ffd257'
  ctx.lineWidth = 2
  ctx.stroke()
  // arrow blade pointing outward toward the hive
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(ang)
  ctx.fillStyle = '#ffd257'
  ctx.beginPath()
  ctx.moveTo(24, 0)
  ctx.lineTo(15, -5)
  ctx.lineTo(15, 5)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.font = '14px serif'
  ctx.textAlign = 'center'
  ctx.fillText('🍯', px, py + 5)
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillStyle = '#ffd257'
  ctx.fillText(`${(d / 100).toFixed(0)}lg`, px, py + 28)
  ctx.globalAlpha = 1
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
  const a = Math.hypot(g.ship.vel.x, g.ship.vel.y) > 4 ? Math.atan2(g.ship.vel.y, g.ship.vel.x) : g.ship.a
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
    ctx.fillText('no seeds — loot or trade for a line,', panel.x + 10, panel.y + 48)
    ctx.fillText('then cross at a port/breeder (F)', panel.x + 10, panel.y + 64)
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
    ctx.fillText(`${ph.shiny ? '✦ ' : ''}${ph.name}`, row.x + 8, row.y + 16)
    // archetype word — the gun's character at a glance
    ctx.fillStyle = ELEMENT_COLOR[ph.element]
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(ph.role, row.x + 8, row.y + 32)
    // the real gun: these numbers fold in every coupling, so nothing is hidden
    ctx.fillStyle = '#9fb8c8'
    ctx.fillText(gunLine(ph), row.x + 8, row.y + 47)
    // generation badge
    const badge = seed.gen === 0 ? 'wild' : `F${seed.gen}`
    ctx.fillStyle = seed.gen === 0 ? '#7d97a8' : '#b8e986'
    ctx.textAlign = 'right'
    ctx.fillText(badge, row.x + row.w - 8, row.y + 16)
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

// The gun as it actually fires — every trait coupling is already folded into
// these numbers, so the cadence never lies even when the label ("titan") doesn't.
function gunLine(p: Pheno): string {
  return `${p.dmg}×${p.shots} · ${p.period}s · ${p.range}px · ${p.drain}💧`
}

function drawPlantTooltip(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const hi = g.hoverInfo!
  const p = hi.plant
  const lines = describe(p.genome)
  const title = `${p.pheno.shiny ? '✦ ' : ''}${p.pheno.name} · ${p.pheno.role}${p.gen > 0 ? ` · F${p.gen}` : hi.hostile ? ' · hostile' : ' · wild'}`
  const sub = p.pheno.blurb
  const gun = gunLine(p.pheno)
  const stat = hi.hostile
    ? `hp ${Math.ceil(p.hp)}/${p.maxHp}`
    : `hp ${Math.ceil(p.hp)}/${p.maxHp} · water ${Math.ceil(p.water)}`

  ctx.font = '12px ui-monospace, monospace'
  const tw = Math.max(
    ctx.measureText(title).width,
    ctx.measureText(gun).width,
    ...lines.map(l => ctx.measureText(l).width),
    ctx.measureText(stat).width
  ) + 24
  const th = 82 + lines.length * 16
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
  // the honest gun line, brighter than the lineage detail below it
  ctx.fillStyle = '#e8f1f5'
  ctx.fillText(gun, bx + 12, by + 54)
  ctx.fillStyle = '#8fb3c9'
  lines.forEach((l, i) => ctx.fillText(l, bx + 12, by + 72 + i * 16))
  ctx.fillStyle = '#cfe3ee'
  ctx.fillText(stat, bx + 12, by + 72 + lines.length * 16)
}

/** the channeling board: two parents, an allele-placement grid per locus, and a
 *  live phenotype preview. RNG is upstream (parents + wildcards); the placement
 *  is the authorship. Layout & hit-testing come from ui.boardLayout. */
function drawBoard(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  const board = g.board!
  const L = boardLayout(w, h, board)
  const accent = board.premium ? '#f4a6d0' : '#ffd257'
  const spend = picksCost(board)

  ctx.fillStyle = 'rgba(2,10,18,0.8)'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(8,24,36,0.98)'
  roundRect(ctx, L.panel.x, L.panel.y, L.panel.w, L.panel.h, 14)
  ctx.fill()
  ctx.strokeStyle = board.premium ? '#f4a6d0' : '#3c6078'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.fillStyle = accent
  ctx.font = 'bold 18px ui-monospace, monospace'
  ctx.fillText(board.premium ? '🐝 breeder boat — channeling (premium)' : '🏝️ port — channeling', L.panel.x + 18, L.panel.y + 28)

  // pollen readout: balance vs the full price of this cross (base + rares)
  const total = BREED_COST + spend
  ctx.textAlign = 'right'
  ctx.font = 'bold 13px ui-monospace, monospace'
  ctx.fillStyle = total > board.pollen ? '#e79a9a' : spend > 0 ? '#ffd257' : '#9fb8c8'
  ctx.fillText(`🌼 ${board.pollen}  −${total}`, L.panel.x + L.panel.w - 18, L.panel.y + 28)
  ctx.textAlign = 'left'

  // one-line rules hint above the locus grid
  if (L.ready && L.loci.length) {
    ctx.fillStyle = '#6f8a9a'
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText('rare alleles cost 🌼 — bee bounties pay it' + (board.premium ? ', rares half price here' : ''), L.loci[0].rect.x, L.panel.y + 44)
  }

  // parent slots
  for (const ps of L.parents) {
    ctx.fillStyle = ps.focused ? 'rgba(60,96,120,0.9)' : 'rgba(255,255,255,0.05)'
    roundRect(ctx, ps.rect.x, ps.rect.y, ps.rect.w, ps.rect.h, 8)
    ctx.fill()
    if (ps.focused) {
      ctx.strokeStyle = '#ffd257'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.fillStyle = '#7d97a8'
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText(ps.slot === 0 ? 'parent A' : 'parent B', ps.rect.x + 8, ps.rect.y + 15)
    if (ps.parent) {
      const ph = phenoOf(ps.parent.genome)
      ctx.fillStyle = ph.shiny ? '#ffe9a8' : '#e8f1f5'
      ctx.font = 'bold 12px ui-monospace, monospace'
      ctx.fillText(fit(ctx, ph.name, ps.rect.w - 16), ps.rect.x + 8, ps.rect.y + 33)
      ctx.fillStyle = '#9fb8c8'
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillText(fit(ctx, `${ps.parent.label} · ${ph.role}`, ps.rect.w - 16), ps.rect.x + 8, ps.rect.y + 47)
    } else {
      ctx.fillStyle = '#5f7a8a'
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillText('click a line ↓', ps.rect.x + 8, ps.rect.y + 36)
    }
  }

  // stock list (clipped)
  ctx.fillStyle = '#7d97a8'
  ctx.font = 'bold 11px ui-monospace, monospace'
  ctx.fillText('your lines — click to add · ✕ toss', L.stockClip.x, L.stockClip.y - 6)
  ctx.save()
  ctx.beginPath()
  ctx.rect(L.stockClip.x, L.stockClip.y, L.stockClip.w, L.stockClip.h)
  ctx.clip()
  for (const s of L.stock) {
    const chosen = board.parents.some(p => p === s.entry)
    ctx.fillStyle = chosen ? 'rgba(60,96,120,0.75)' : 'rgba(255,255,255,0.05)'
    roundRect(ctx, s.rect.x, s.rect.y, s.rect.w, s.rect.h, 6)
    ctx.fill()
    const ph = phenoOf(s.entry.genome)
    ctx.textAlign = 'left'
    ctx.fillStyle = ph.shiny ? '#ffe9a8' : '#e8f1f5'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(fit(ctx, `${ph.shiny ? '✦ ' : ''}${ph.name}`, s.rect.w - (s.delRect ? 92 : 70)), s.rect.x + 6, s.rect.y + 14)
    ctx.fillStyle = '#8fb3c9'
    ctx.textAlign = 'right'
    ctx.fillText(`${s.entry.label} ${s.entry.gen ? 'F' + s.entry.gen : 'wild'}`, s.rect.x + s.rect.w - (s.delRect ? 24 : 6), s.rect.y + 14)
    if (s.delRect) {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#e79a9a'
      ctx.fillText('✕', s.delRect.x + s.delRect.w / 2, s.rect.y + 14)
    }
    ctx.textAlign = 'left'
  }
  ctx.restore()

  // locus rows: chips flanking the child's expressed trait
  for (const row of L.loci) {
    ctx.textAlign = 'left'
    ctx.fillStyle = '#9fb8c8'
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(row.locus, row.rect.x, row.rect.y + row.rect.h / 2 + 4)
    for (const c of row.chips) drawChip(ctx, c)
    const s0 = row.chips.filter(c => c.slot === 0)
    const s1 = row.chips.filter(c => c.slot === 1)
    if (L.ready && s0.length && s1.length) {
      const cx = (Math.max(...s0.map(c => c.rect.x + c.rect.w)) + Math.min(...s1.map(c => c.rect.x))) / 2
      ctx.textAlign = 'center'
      ctx.fillStyle = row.expressedRare ? '#ffe9a8' : '#cfe3ee'
      ctx.font = 'bold 11px ui-monospace, monospace'
      ctx.fillText(fit(ctx, row.expressedLabel, 76), cx, row.rect.y + row.rect.h / 2 + 4)
      ctx.textAlign = 'left'
    }
  }

  // live preview line
  ctx.textAlign = 'left'
  if (L.child) {
    const ph = phenotype(L.child)
    const syn = synergies(L.child)
    ctx.fillStyle = ph.shiny ? '#ffe9a8' : '#e8f1f5'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText(`${ph.shiny ? '✦ ' : ''}${ph.name} · ${ph.role} · ${gunLine(ph)}`, L.preview.x, L.preview.y + 14)
    if (syn.length) {
      ctx.fillStyle = '#c9a0ff'
      ctx.fillText(`⟡ synergy: ${syn.join(' · ')}`, L.preview.x, L.preview.y + 30)
    }
  } else {
    ctx.fillStyle = '#7d97a8'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillText('set both parents to begin channelling', L.preview.x, L.preview.y + 14)
  }

  // buttons
  drawBoardBtn(ctx, L.cancelBtn, 'cancel · Esc', '#e79a9a')
  if (L.ready) {
    drawBoardBtn(ctx, L.autoBtn, 'auto-best · F', '#b8e986')
    drawBoardBtn(ctx, L.crossBtn, `cross · Enter (${BREED_COST + spend}🌼)`, accent)
  }

  // feedback line (refusals, tossed seeds) — world toasts would hide behind the modal
  if (g.boardMsg) {
    ctx.globalAlpha = Math.min(1, g.boardMsg.t / 0.6)
    ctx.textAlign = 'center'
    ctx.font = 'bold 12px ui-monospace, monospace'
    ctx.fillStyle = g.boardMsg.color
    ctx.fillText(g.boardMsg.text, L.panel.x + L.panel.w / 2, L.cancelBtn.y + 25)
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  }
}

function drawChip(ctx: CanvasRenderingContext2D, c: BoardChip) {
  const rare = alleleDef(c.locus, c.allele).rare
  ctx.globalAlpha = c.locked ? 0.4 : 1 // a rare you can't afford right now
  ctx.fillStyle = c.chosen ? (c.source === 'wild' ? 'rgba(150,100,40,0.9)' : 'rgba(52,104,74,0.9)') : 'rgba(255,255,255,0.06)'
  roundRect(ctx, c.rect.x, c.rect.y, c.rect.w, c.rect.h, 5)
  ctx.fill()
  if (c.chosen) {
    ctx.strokeStyle = c.source === 'wild' ? '#ffcf7a' : '#ffd257'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.textAlign = 'center'
  ctx.fillStyle = c.source === 'wild' ? '#ffd9a0' : rare ? '#ffe9a8' : '#dcebf3'
  ctx.font = '10px ui-monospace, monospace'
  const label = (c.source === 'wild' ? '✦' : rare ? '·' : '') + alleleDef(c.locus, c.allele).label
  ctx.fillText(fit(ctx, label, c.rect.w - 4), c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h / 2 + 4)
  if (c.cost > 0) {
    // pollen price tag in the corner of a chargeable rare
    ctx.textAlign = 'right'
    ctx.fillStyle = c.locked ? '#e79a9a' : '#ffd257'
    ctx.font = 'bold 8px ui-monospace, monospace'
    ctx.fillText(`${c.cost}🌼`, c.rect.x + c.rect.w - 3, c.rect.y + 9)
  }
  ctx.textAlign = 'left'
  ctx.globalAlpha = 1
}

function drawBoardBtn(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, label: string, color: string) {
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  roundRect(ctx, r.x, r.y, r.w, r.h, 8)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = color
  ctx.font = 'bold 12px ui-monospace, monospace'
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 4)
  ctx.textAlign = 'left'
}

/** clip a string to fit a pixel width in the current font, adding an ellipsis */
function fit(ctx: CanvasRenderingContext2D, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW) return s
  let out = s
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1)
  return out + '…'
}

/** the controls summary — shown in full on the start screen, and again
 *  (that's the whole point) on the pause screen so it's never more than
 *  one key away */
const CONTROL_LINES = [
  'A/D — helm · W — sheet in · S — back water · SPACE — FIRE (A/D+SPACE — one rail) · Z/X — gun range',
  '1–3 — tools (🌱 sow · 💧 water · 🎯 trim a gun’s range) · Q/E — cycle seed · B — boil 1🪵 → 2💧 · U — refit',
  'T — trade/parley · F — breed (port/hive/boat) · I — suggest something · P/Esc — pause · H — help',
]

function drawHelp(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) {
  ctx.fillStyle = 'rgba(2,12,20,0.82)'
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd257'
  ctx.font = 'bold 44px ui-monospace, monospace'
  ctx.fillText('🌱 raftig', w / 2, h * 0.16)
  ctx.fillStyle = '#9fb8c8'
  ctx.font = '15px ui-monospace, monospace'
  ctx.fillText('a raft roguelike where your garden is the gun deck', w / 2, h * 0.16 + 28)

  ctx.fillStyle = '#dcebf3'
  ctx.font = '14px ui-monospace, monospace'
  CONTROL_LINES.forEach((l, i) => ctx.fillText(l, w / 2, h * 0.42 + i * 22))

  ctx.fillStyle = '#ffd257'
  ctx.font = 'bold 18px ui-monospace, monospace'
  ctx.fillText('— click to start —', w / 2, h * 0.42 + CONTROL_LINES.length * 22 + 40)
}

function drawGameOver(ctx: CanvasRenderingContext2D, g: Game, w: number, h: number, t: number) {
  ctx.fillStyle = 'rgba(10,4,4,0.72)'
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ff8a65'
  ctx.font = 'bold 44px ui-monospace, monospace'
  ctx.fillText('she went down', w / 2, h / 2 - 70)
  ctx.fillStyle = '#e8f1f5'
  ctx.font = '16px ui-monospace, monospace'
  const mins = Math.floor(g.stats.time / 60)
  const secs = Math.floor(g.stats.time % 60)
  ctx.fillText(
    `ships sunk: ${g.stats.sunk} · seeds bred: ${g.stats.bred} · farthest ${(g.stats.far / 100).toFixed(1)} leagues · ${mins}:${secs.toString().padStart(2, '0')} afloat`,
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
