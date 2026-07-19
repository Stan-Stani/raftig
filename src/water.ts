import { hash01 } from './util'

/** Shared water-effect drawing — the Kelvin wake a hull drags behind it and
 *  the ring ripples a sinking hull pushes out. One module so both effects
 *  build from the same primitives (foam beads, hash jitter, the same foam
 *  palette) and read as the same water, and so lab.html can drive them in
 *  isolation without dragging in the whole game. */

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
  ctx.strokeStyle = '#eaf6fa'
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
  ctx.fillStyle = '#eaf6fa'
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
  ctx.fillStyle = '#f2fbff'
  for (let i = 0; i < RIPPLE_BEADS; i++) {
    const a = hash01(i * 9.7 + seed, i * 5.1 + seed * 0.6) * Math.PI * 2
    const hy = hash01(i * 3.3 + seed, i * 6.7 + seed * 1.3)
    const jr = r * (0.55 + hy * 0.52) // r*0.55 .. r*1.07 — a band, biased inward
    ctx.globalAlpha = alpha * 0.15 * (0.4 + hy)
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
    drawRipple(ctx, cx, cy, radius, (launch === 0 ? 0.85 : 0.55) * fade, seed + launch * 97)
  }
  // the boil: churned foam over the grave, drifting slowly outward as it dies
  const boil = 1 - elapsed / 3
  if (boil > 0) {
    ctx.fillStyle = '#eaf6fa'
    for (let i = 0; i < 34; i++) {
      const hx = hash01(i * 9.1 + seed, i * 4.7 + seed * 1.3)
      const hy = hash01(i * 3.7 + seed * 0.7, i * 6.3 + seed)
      const a = hx * Math.PI * 2 + elapsed * (hy - 0.5) * 0.8
      const rr = Math.sqrt(hy) * hullR * (0.65 + elapsed * 0.22)
      drawFoamBead(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, hx, hy, Math.pow(boil, 1.6) * 0.65)
    }
    ctx.globalAlpha = 1
  }
}
