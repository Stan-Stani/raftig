import { hash01, clamp } from './util'

/** Shared water-effect drawing — the Kelvin wake a hull drags behind it, the
 *  ring ripples a sinking hull pushes out, and the squalls that blow over both.
 *  One module so every effect builds from the same primitives (foam beads, hash
 *  jitter, the same foam palette) and reads as the same water, and so lab.html
 *  can drive them in isolation without dragging in the whole game. */

/** a fixed sample of a hull's course: where it was, how it was moving, when */
export type TrailPoint = { x: number; y: number; vx: number; vy: number; t: number }
export type WakeOpts = { win?: number; haze?: boolean; amp?: number }

export const WAKE_TAN_HALF_ANGLE = 0.354 // tan(~19.5°), the real Kelvin wake half-angle

/** The exact jittered foam dab used by both travelling wakes and ripple crests. */
export function drawFoamBead(ctx: CanvasRenderingContext2D, x: number, y: number, hx: number, hy: number, alpha: number) {
  ctx.globalAlpha = Math.max(0, alpha * (0.6 + hy))
  ctx.beginPath()
  ctx.arc(x + (hx - 0.5) * 6, y + (hy - 0.5) * 6, 0.5 + hy * 1.4, 0, Math.PI * 2)
  ctx.fill()
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
export function drawWake(
  ctx: CanvasRenderingContext2D,
  trail: TrailPoint[],
  beam: number,
  time: number,
  opts: WakeOpts = {},
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
      drawFoamBead(ctx, qx, qy, hx, hy, amp * fade * bright)
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

/** One outward-travelling ripple, built the way drawWake builds a wake — not a
 *  drafted circle. A ring pulse is a wave PACKET: a bright leading crest with
 *  a dimmer crest or two chasing it, foam trailing on the inside. The leading
 *  crest is a run of short arclets stamped en echelon around the circle (the
 *  radial analog of the wake's feather barbs), each pulled slightly off the
 *  true centre so the crest reads as churn; the chasers are broken beaded
 *  rings like the wake's transverse crests. Slot and bead counts are FIXED —
 *  independent of radius — so each mark keeps its own jitter for life and
 *  slides smoothly outward instead of re-rolling as the ring grows. */
const RIPPLE_SLOTS = 34 // leading-crest arclets — crest breaks up as it expands
const RIPPLE_BEADS = 60 // foam beads per full crest ring — thins as it stretches

export function drawRipple(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha: number, seed: number) {
  if (alpha <= 0 || r <= 4) return
  ctx.lineCap = 'round'

  // 1. leading crest: a feather of short wavelet barbs around the ring, the
  //    radial analog of the wake's divergent feather — each barb sits on a
  //    jittered ring position, tilts a little off the tangent, and bows
  //    gently outward, so the crest reads as churned wavelets en echelon
  //    rather than a dashed circle
  ctx.strokeStyle = '#91bac8'
  for (let i = 0; i < RIPPLE_SLOTS; i++) {
    const h1 = hash01(i * 12.9 + seed, i * 3.7 + seed * 1.7)
    if (h1 < 0.26) continue // drop some slots — a broken, gappy crest
    const h2 = hash01(i * 5.3 + seed * 2.3, i * 8.1 + seed)
    const h3 = hash01(i * 7.7 + seed * 0.7, i * 2.9 + seed * 3.1)
    const a = ((i + h2 * 0.9) / RIPPLE_SLOTS) * Math.PI * 2
    const jr = r * (0.94 + h1 * 0.11)
    const px = cx + Math.cos(a) * jr
    const py = cy + Math.sin(a) * jr
    const tilt = a + Math.PI / 2 + (h3 - 0.5) * 0.55 // off-tangent, like a barb
    const len = (5 + h2 * 9) * (0.7 + r * 0.003) // wavelets stretch as it spreads
    const tx = Math.cos(tilt)
    const ty = Math.sin(tilt)
    ctx.globalAlpha = alpha * (0.28 + 0.5 * h2)
    ctx.lineWidth = 0.8 + h3 * 1.7
    ctx.beginPath()
    ctx.moveTo(px - tx * len * 0.5, py - ty * len * 0.5)
    // control point nudged outward so each wavelet bows with the ring
    ctx.quadraticCurveTo(px + Math.cos(a) * len * 0.18, py + Math.sin(a) * len * 0.18, px + tx * len * 0.5, py + ty * len * 0.5)
    ctx.stroke()
  }

  // 2. the packet: foam beads riding the leader, and ONE dimmer beaded crest
  //    chasing a wavelength behind — a second chaser turned each pulse into
  //    tree-ring clutter once two pulses overlapped
  ctx.fillStyle = '#91bac8'
  const gap = 8 + r * 0.12 // wavelength opens up as the ring spreads
  for (let k = 0; k < 2; k++) {
    const rr = r - gap * k
    if (rr < 7) break
    const amp = k === 0 ? 0.8 : 0.38
    const beads = Math.max(10, Math.round(RIPPLE_BEADS * (k === 0 ? 1 : 0.55)))
    for (let i = 0; i < beads; i++) {
      const hx = hash01(i * 12.7 + seed + k * 13.1, i * 4.3 + seed * 1.9)
      if (hx < 0.38) continue // drop beads unevenly — churn, not a dotted line
      const hy = hash01(i * 7.9 + seed * 2.3 + k * 7.7, i * 3.1 + seed)
      const a = ((i + hx) / beads) * Math.PI * 2 + k * 0.37
      const jr = rr + (hy - 0.5) * (3 + rr * 0.05)
      drawFoamBead(ctx, cx + Math.cos(a) * jr, cy + Math.sin(a) * jr, hx, hy, alpha * amp * (0.35 + 0.4 * hy))
    }
  }

  // 3. foam haze: dim flecks banded across the packet, mostly INSIDE the
  //    leading crest — spent foam the wave leaves behind as it spreads
  ctx.fillStyle = '#7fa7b6'
  for (let i = 0; i < RIPPLE_BEADS; i++) {
    const a = hash01(i * 9.7 + seed, i * 5.1 + seed * 0.6) * Math.PI * 2
    const hy = hash01(i * 3.3 + seed, i * 6.7 + seed * 1.3)
    const jr = r * (0.55 + hy * 0.52) // r*0.55 .. r*1.07 — a band, biased inward
    ctx.globalAlpha = alpha * 0.09 * (0.4 + hy)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * jr, cy + Math.sin(a) * jr, 0.6 + hy * 1.2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
}

/** Water displaced by a hull going under: ring-pulse packets spreading from
 *  where she sat (radius ~ sqrt(age) — real ripples decelerate as they widen)
 *  over a churning boil of foam that marks the spot and slowly dies. `elapsed`
 *  is seconds since she started going down; `seed` fixes the jitter so the
 *  marks are hers alone and hold still frame to frame. */
export function drawSinkRipples(ctx: CanvasRenderingContext2D, cx: number, cy: number, hullR: number, elapsed: number, seed: number) {
  const spread = 46 // px / sqrt(second)
  const life = 4.4
  for (const launch of [0, 1.5]) {
    const age = elapsed - launch
    if (age <= 0 || age >= life) continue
    const fade = Math.min(1, age / 0.25) * Math.pow(1 - age / life, 0.8)
    const radius = hullR * 0.45 + spread * Math.sqrt(age)
    // the follow-up pulse rides dimmer — the first carries the violence
    drawRipple(ctx, cx, cy, radius, (launch === 0 ? 0.52 : 0.32) * fade, seed + launch * 97)
  }
  // the boil: churned foam over the grave, drifting slowly outward as it dies
  const boil = 1 - elapsed / 3
  if (boil > 0) {
    ctx.fillStyle = '#78a5b5'
    for (let i = 0; i < 34; i++) {
      const hx = hash01(i * 9.1 + seed, i * 4.7 + seed * 1.3)
      const hy = hash01(i * 3.7 + seed * 0.7, i * 6.3 + seed)
      const a = hx * Math.PI * 2 + elapsed * (hy - 0.5) * 0.8
      const rr = Math.sqrt(hy) * hullR * (0.65 + elapsed * 0.22)
      drawFoamBead(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, hx, hy, Math.pow(boil, 1.6) * 0.32)
    }
    ctx.globalAlpha = 1
  }
}

const TAU = Math.PI * 2

/** where the world sits on screen: `x,y` is the world point under screen centre,
 *  `zoom` the camera scale. The whole squall lives in world coordinates, so this
 *  is what pins it to the sea. Defaults to a still camera at the origin. */
export type SquallView = { x: number; y: number; zoom: number }
export type SquallOpts = {
  intensity?: number // 0..1 — how hard it is coming down; squalls ramp in and out
  windA?: number // wind bearing, radians. Rain only *rakes* downwind; gravity wins
  windSpeed?: number // how hard it rakes
  view?: SquallView
  splashes?: boolean // the marks drops leave on landing; on by default
}

/** The three builds of raindrop, fine → fat. A drop's weight picks its build,
 *  and the same weight picks the splash it leaves, so the fat streak you watched
 *  come down is the one that throws the fat crown. Not depth layers: every drop
 *  here is really in the water, so this is variety, not parallax. */
const DROP_KINDS = [
  { w: 0.7, a: 0.3, spd: 560, fall: 0.34, len: 15, col: '#8fb6cf' },
  { w: 1.1, a: 0.42, spd: 820, fall: 0.32, len: 26, col: '#c2ddee' },
  { w: 1.7, a: 0.55, spd: 1120, fall: 0.3, len: 40, col: '#eaf7ff' },
]
const RAIN_CELL = 44 // world px per patch of sea that catches its own drops
const SPLASH_LIFE = 0.42 // seconds a ring takes to spread and die
const CROWN_LIFE = 0.28

/** Airborne drops, gathered in one sweep of the sea and then stroked in a few
 *  batches by build. Module-level and fixed-size: the sweep runs every frame and
 *  must not allocate. Overflow just drops the surplus — 640 is far past what a
 *  screenful holds. */
const MAX_DROPS = 640
const dropX = new Float32Array(MAX_DROPS)
const dropY = new Float32Array(MAX_DROPS)
const dropLen = new Float32Array(MAX_DROPS)
const dropKind = new Uint8Array(MAX_DROPS)

/** A squall blowing over the sea.
 *
 *  The rain is not a sheet of streaks laid over the picture — every drop is a
 *  real object falling to a real patch of water, and the splash you see is that
 *  drop landing. Each cell of sea keeps its own clock; on each beat it decides
 *  whether it catches a drop and how fat that drop is. From that one decision
 *  come both the streak falling toward the cell and, a moment later, the mark it
 *  leaves. Nothing is stored between frames: given `t` the whole shower is
 *  reproducible, and a drop and its splash agree because they are read off the
 *  same hash.
 *
 *  Everything is in world coordinates, mapped through `opts.view`. That is what
 *  keeps a splash sitting on the water while the camera moves, and it is also
 *  what keeps the shower steady: a drop's position is measured *back* from where
 *  it is about to land, never accumulated forward from t=0, so neither a gust
 *  nor a wind shift can slew the field across the screen.
 *
 *  This view is top-down, so a falling drop really heads at the camera, which is
 *  unreadable; rain in a top-down game is drawn by convention as a raking streak
 *  instead. Hence a fixed downward bias, swung by the live wind. */
export function drawSquall(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, opts: SquallOpts = {}) {
  const inten = clamp(opts.intensity ?? 1, 0, 1)
  if (inten <= 0.001) return
  const windA = opts.windA ?? 0
  const windSpeed = opts.windSpeed ?? 30
  const view = opts.view ?? { x: 0, y: 0, zoom: 1 }
  const z = view.zoom || 1

  ctx.save()

  // Which way the rain runs. A gentle sway keeps the sheet alive without the
  // shower lurching: it only pivots each drop about the point it is landing on,
  // and no drop is ever more than its own fall away from that point.
  const sway = 1 + 0.12 * Math.sin(t * 0.5) + 0.05 * Math.sin(t * 1.31 + 1.3)
  const rake = (0.35 + Math.min(1, windSpeed / 50) * 0.85) * sway
  let dx = Math.cos(windA) * rake
  // floored, so a northerly can flatten the rake without standing the rain on end
  let dy = Math.max(0.5, 1 + Math.sin(windA) * rake * 0.45)
  const dn = Math.hypot(dx, dy)
  dx /= dn
  dy /= dn

  // 1. the wash: rain between you and everything else, greying the whole sea
  ctx.fillStyle = `rgba(64, 106, 136, ${0.05 + 0.1 * inten})`
  ctx.fillRect(0, 0, w, h)

  // 2. curtains: broad soft sheets of heavier rain sweeping downwind. Squalls
  //    are not uniform, and these slow drifting bands carry that — the drops
  //    alone read as an even, mechanical drizzle. Screen-space on purpose: this
  //    is haze hanging in the air, not anything sitting on the water
  const gust = 0.85 + 0.15 * Math.sin(t * 0.63)
  for (let k = 0; k < 2; k++) {
    const bw = w * (0.3 + 0.16 * k)
    const span = w + bw * 2
    const travel = (t * (90 + k * 55) + k * 900) % span
    const cx = dx >= 0 ? travel - bw : w + bw - travel
    const band = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0)
    const peak = (0.035 + 0.03 * k) * inten * gust
    band.addColorStop(0, 'rgba(190, 226, 245, 0)')
    band.addColorStop(0.5, `rgba(190, 226, 245, ${peak})`)
    band.addColorStop(1, 'rgba(190, 226, 245, 0)')
    ctx.fillStyle = band
    ctx.fillRect(cx - bw, 0, bw * 2, h)
  }

  // 3. one sweep of the sea, drawing every splash and gathering every drop.
  //    Cells upwind of the frame are swept too: their drops are still in the air
  //    over open water you can see, even though the water they will hit is not
  const halfW = w / 2 / z
  const halfH = h / 2 / z
  const vx0 = view.x - halfW
  const vx1 = view.x + halfW
  const vy0 = view.y - halfH
  const vy1 = view.y + halfH
  let reach = 0
  for (const k of DROP_KINDS) reach = Math.max(reach, k.spd * k.fall)
  const rx = dx * reach
  const ry = dy * reach
  const gx0 = Math.floor((vx0 + Math.min(0, rx)) / RAIN_CELL)
  const gx1 = Math.floor((vx1 + Math.max(0, rx)) / RAIN_CELL)
  const gy0 = Math.floor((vy0 + Math.min(0, ry)) / RAIN_CELL)
  const gy1 = Math.floor((vy1 + Math.max(0, ry)) / RAIN_CELL)

  const dens = 0.16 + 0.34 * inten // share of beats that actually catch a drop
  const splashOn = opts.splashes ?? true
  let nDrops = 0

  for (let gx = gx0; gx <= gx1; gx++) {
    const cellX = gx * RAIN_CELL
    const inX = cellX > vx0 - RAIN_CELL && cellX < vx1
    for (let gy = gy0; gy <= gy1; gy++) {
      const per = 0.5 + hash01(gy * 1.7, gx * 2.9) * 0.7 // this patch's own beat
      const u = t / per + hash01(gx * 9.1, gy * 4.3)
      const cyc = Math.floor(u)
      const f = u - cyc

      // the drop that landed here f*per seconds ago, and the mark it left
      const cellY = gy * RAIN_CELL
      if (splashOn && inX && cellY > vy0 - RAIN_CELL && cellY < vy1) {
        const hw = hash01(gx * 3.71 + cyc * 21.3, gy * 5.13 + cyc * 6.7)
        if (hw <= dens) {
          const wgt = hw / dens // the same weight the drop had on the way down
          const age = f * per
          const jx = hash01(gx * 3.1 + cyc * 13.77, gy * 5.3 + cyc * 7.19)
          const jy = hash01(gy * 7.7 + cyc * 4.31, gx * 1.9 + cyc * 9.53)
          const sx = (cellX + jx * RAIN_CELL - view.x) * z + w / 2
          const sy = (cellY + jy * RAIN_CELL - view.y) * z + h / 2

          // the hit itself — a bright fleck, gone almost before you see it. It
          // is the only thing tying a streak to its mark, so it has to land hard
          if (age < 0.09) {
            ctx.fillStyle = '#f2fbff'
            ctx.globalAlpha = (1 - age / 0.09) * 0.85 * inten
            ctx.beginPath()
            ctx.arc(sx, sy, (1 + wgt * 1.1) * z, 0, TAU)
            ctx.fill()
          }

          // the ring it pushes out — beaded, like every other crest in this
          // file. A stroked circle reads as a bubble floating on the water; a
          // broken run of foam dabs reads as the surface being hit
          if (wgt > 0.35 && age < SPLASH_LIFE) {
            const life = 1 - age / SPLASH_LIFE
            // a floor on the weight term: without it most rings sit at the dim
            // end of the curve and the shower reads as streaks over water again
            const ring = Math.pow(life, 1.9) * inten * (0.45 + 0.55 * ((wgt - 0.35) / 0.65))
            ctx.fillStyle = '#cfeaf7'
            const rr = (1 + (1 - life) * (4 + wgt * 5)) * z
            const beads = 5 + Math.floor(jy * 3)
            for (let s = 0; s < beads; s++) {
              const hx = hash01(s * 12.7 + cyc + gx, s * 4.3 + gy)
              if (hx < 0.2) continue // drop beads unevenly — a gappy, churned ring
              const hy = hash01(s * 7.9 + gy, s * 3.1 + cyc + gx)
              const a = ((s + hx * 0.8) / beads) * TAU
              const jr = rr + (hy - 0.5) * 1.6 * z
              ctx.globalAlpha = ring * (0.45 + 0.55 * hy)
              ctx.beginPath()
              ctx.arc(sx + Math.cos(a) * jr, sy + Math.sin(a) * jr, (0.45 + hy * 0.6) * z, 0, TAU)
              ctx.fill()
            }
          }

          // only the fattest drops throw a crown of spray, up and out then down
          if (wgt > 0.8 && age < CROWN_LIFE) {
            const cf = age / CROWN_LIFE
            ctx.fillStyle = '#eaf6fa'
            ctx.globalAlpha = (1 - cf) * 0.42 * inten
            const cr = cf * (4 + jx * 3) * z
            const lift = Math.sin(cf * Math.PI) * 3 * z
            for (let s = 0; s < 3; s++) {
              const a = -Math.PI / 2 + (s - 1) * 0.9
              ctx.beginPath()
              ctx.arc(sx + Math.cos(a) * cr, sy + Math.sin(a) * cr * 0.5 - lift, 0.6 * z, 0, TAU)
              ctx.fill()
            }
          }
        }
      }

      // ...and the drop presently in the air, falling toward this same patch on
      // its next beat. Reading the *next* cycle's hash is what ties the two
      // together: when the beat turns over, this drop becomes that splash
      const cn = cyc + 1
      const hn = hash01(gx * 3.71 + cn * 21.3, gy * 5.13 + cn * 6.7)
      if (hn > dens || nDrops >= MAX_DROPS) continue
      const wn = hn / dens
      const ki = Math.min(DROP_KINDS.length - 1, Math.floor(wn * DROP_KINDS.length))
      const kind = DROP_KINDS[ki]
      const toLand = (1 - f) * per // seconds until it strikes
      if (toLand > kind.fall) continue

      const jx = hash01(gx * 3.1 + cn * 13.77, gy * 5.3 + cn * 7.19)
      const jy = hash01(gy * 7.7 + cn * 4.31, gx * 1.9 + cn * 9.53)
      const wx = cellX + jx * RAIN_CELL - dx * toLand * kind.spd
      const wy = cellY + jy * RAIN_CELL - dy * toLand * kind.spd
      const sx = (wx - view.x) * z + w / 2
      const sy = (wy - view.y) * z + h / 2
      if (sx < -90 || sx > w + 90 || sy < -90 || sy > h + 90) continue

      // the streak draws out of nothing as the drop gets going, so drops enter
      // the frame instead of popping into it — length is geometry, so this costs
      // nothing, where fading each drop in would break the batching
      const drawn = Math.min(1, (kind.fall - toLand) / (kind.fall * 0.3))
      dropX[nDrops] = sx
      dropY[nDrops] = sy
      dropLen[nDrops] = kind.len * (0.75 + jy * 0.5) * drawn * z
      dropKind[nDrops] = ki
      nDrops++
    }
  }

  // 4. the rain itself, over the water it is about to hit. Each drop strokes
  //    twice: a long dim tail, then a short bright head over it. A per-drop
  //    gradient is the honest way to taper a streak and far too dear at this
  //    count — two flat passes fake it, and without the taper the whole shower
  //    reads as a field of scratches
  ctx.lineCap = 'round'
  for (let ki = 0; ki < DROP_KINDS.length; ki++) {
    const kind = DROP_KINDS[ki]
    ctx.strokeStyle = kind.col
    for (let head = 0; head < 2; head++) {
      ctx.lineWidth = (head ? kind.w : kind.w * 0.7) * z
      ctx.globalAlpha = Math.min(1, kind.a * inten * (head ? 1.4 : 0.5))
      ctx.beginPath()
      for (let i = 0; i < nDrops; i++) {
        if (dropKind[i] !== ki) continue
        const len = dropLen[i] * (head ? 0.3 : 1)
        ctx.moveTo(dropX[i], dropY[i])
        ctx.lineTo(dropX[i] - dx * len, dropY[i] - dy * len)
      }
      ctx.stroke()
    }
  }

  ctx.globalAlpha = 1
  ctx.lineCap = 'butt'
  ctx.restore()
}
