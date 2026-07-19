import { hash01, angleDiff } from './util'
import { drawWake, drawSinkRipples, TrailPoint } from './water'

/** The water lab (lab.html, dev-only): drives a bare hull around the screen
 *  and pops sink ripples on demand so wakes and ripples can be eyeballed side
 *  by side and iterated on without playing a run to set each shot up. Talks
 *  only to water.ts — if an effect looks right here, it looks right in game.
 *  `window.__lab` exposes the whole sim so a console (or an automation tool
 *  in a backgrounded tab, where rAF freezes) can step time by hand. */

const canvas = document.getElementById('lab') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let vw = 0
let vh = 0
let dpr = 1
function resize() {
  dpr = window.devicePixelRatio || 1
  vw = window.innerWidth
  vh = window.innerHeight
  canvas.width = Math.floor(vw * dpr)
  canvas.height = Math.floor(vh * dpr)
  canvas.style.width = `${vw}px`
  canvas.style.height = `${vh}px`
}
window.addEventListener('resize', resize)
resize()

const p = {
  mode: 'circle' as 'circle' | 'weave' | 'straight',
  speed: 240,
  turn: 0.55, // rad/s, circle mode
  beam: 16,
  hullR: 16,
  timeScale: 1,
  haze: true,
}

type Ripple = { x: number; y: number; hullR: number; start: number; seed: number }

const lab = {
  t: 0,
  paused: false,
  boat: { x: 0, y: 0, h: 0 },
  trail: [] as TrailPoint[],
  ripples: [] as Ripple[],
  nextAuto: 1, // the standing demo ripple re-fires on its own
  p,
  spawnRipple(x: number, y: number) {
    this.ripples.push({ x, y, hullR: p.hullR, start: this.t, seed: x * 0.7 + y * 1.3 })
  },
  step(dt: number) {
    update(dt)
    draw()
  },
}
;(window as unknown as { __lab: typeof lab }).__lab = lab
lab.boat.x = vw * 0.35
lab.boat.y = vh * 0.5

// where the boat orbits and where the demo ripple lives — boat on the left
// two-thirds, ripple station on the right, so both stay on screen at once
const orbit = () => ({ x: vw * 0.35, y: vh * 0.5, r: Math.min(vw, vh) * 0.3 })
const station = () => ({ x: vw * 0.82, y: vh * 0.42 })

function update(dt: number) {
  lab.t += dt
  const b = lab.boat

  // helm: each course mode bends the heading its own way, then a soft pull
  // back toward the orbit centre keeps her from sailing off any screen edge
  if (p.mode === 'circle') b.h += p.turn * dt
  else if (p.mode === 'weave') b.h += Math.sin(lab.t * 1.1) * 2.4 * dt
  const o = orbit()
  const dx = o.x - b.x
  const dy = o.y - b.y
  const d = Math.hypot(dx, dy)
  if (d > o.r) b.h += angleDiff(Math.atan2(dy, dx), b.h) * Math.min(1, (d - o.r) / 90) * 4 * dt

  const vx = Math.cos(b.h) * p.speed
  const vy = Math.sin(b.h) * p.speed
  b.x += vx * dt
  b.y += vy * dt

  // course history, exactly as the game keeps it (game.ts shipTrail)
  lab.trail.push({ x: b.x, y: b.y, vx, vy, t: lab.t })
  while (lab.trail.length && lab.trail[0].t < lab.t - 1.5) lab.trail.shift()

  // the standing demo ripple: re-fire at the station whenever the last round ends
  if (lab.t >= lab.nextAuto) {
    const s = station()
    lab.spawnRipple(s.x, s.y)
    lab.nextAuto = lab.t + 7
  }
  lab.ripples = lab.ripples.filter(r => lab.t - r.start < 6.5)
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // the game's calm-band sea gradient, so brightness reads in real context
  const grad = ctx.createLinearGradient(0, 0, 0, vh)
  grad.addColorStop(0, '#0d4a6f')
  grad.addColorStop(1, '#072a40')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, vw, vh)

  // faint ambient swell flecks — stand-ins for the game's drawWaves, here so
  // effect alphas get judged against living water, not a flat void
  ctx.fillStyle = '#bfe3f2'
  const cell = 110
  for (let gx = 0; gx < vw / cell + 1; gx++) {
    for (let gy = 0; gy < vh / cell + 1; gy++) {
      const h1 = hash01(gx * 3.1, gy * 5.3)
      const h2 = hash01(gy * 7.7, gx * 1.9)
      const x = gx * cell + h1 * cell
      const y = gy * cell + h2 * cell + Math.sin(lab.t * 1.3 + h1 * 12) * 3
      ctx.globalAlpha = 0.05 + 0.05 * Math.sin(lab.t * 0.9 + h2 * 9)
      ctx.beginPath()
      ctx.arc(x, y, 1 + h2 * 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1

  drawWake(ctx, lab.trail, p.beam, lab.t, { haze: p.haze })
  for (const r of lab.ripples) drawSinkRipples(ctx, r.x, r.y, r.hullR, lab.t - r.start, r.seed)

  // the hull itself: a bare canoe so the wake hangs off something believable
  const b = lab.boat
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.rotate(b.h)
  const len = p.beam * 2.6
  ctx.fillStyle = '#8a5a33'
  ctx.beginPath()
  ctx.moveTo(len * 0.62, 0)
  ctx.quadraticCurveTo(len * 0.2, p.beam * 0.52, -len * 0.45, p.beam * 0.38)
  ctx.quadraticCurveTo(-len * 0.58, 0, -len * 0.45, -p.beam * 0.38)
  ctx.quadraticCurveTo(len * 0.2, -p.beam * 0.52, len * 0.62, 0)
  ctx.fill()
  ctx.restore()

  // station marker + clock, tucked in a corner
  ctx.fillStyle = '#9fb8c8'
  ctx.font = '11px ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`t=${lab.t.toFixed(2)}${lab.paused ? ' ⏸' : ''}`, 10, vh - 10)
}

// ---- controls ----
const $ = (id: string) => document.getElementById(id)!
function bindRange(id: string, get: () => number, set: (v: number) => void, fmt = (v: number) => `${v}`) {
  const el = $(id) as HTMLInputElement
  const label = $(id + 'V')
  el.value = `${get()}`
  label.textContent = fmt(get())
  el.addEventListener('input', () => {
    set(parseFloat(el.value))
    label.textContent = fmt(get())
  })
}
bindRange('speed', () => p.speed, v => (p.speed = v))
bindRange('turn', () => p.turn, v => (p.turn = v), v => v.toFixed(2))
bindRange('beam', () => p.beam, v => (p.beam = v))
bindRange('hullR', () => p.hullR, v => (p.hullR = v))
bindRange('scale', () => p.timeScale, v => (p.timeScale = v), v => v.toFixed(2))
;($('mode') as HTMLSelectElement).addEventListener('change', e => (p.mode = (e.target as HTMLSelectElement).value as typeof p.mode))
;($('haze') as HTMLInputElement).addEventListener('change', e => (p.haze = (e.target as HTMLInputElement).checked))
$('ripple').addEventListener('click', () => {
  const s = station()
  lab.spawnRipple(s.x, s.y)
})
const pauseBtn = $('pause') as HTMLButtonElement
function togglePause() {
  lab.paused = !lab.paused
  pauseBtn.textContent = lab.paused ? 'run' : 'pause'
}
pauseBtn.addEventListener('click', togglePause)
canvas.addEventListener('pointerdown', e => lab.spawnRipple(e.clientX, e.clientY))
window.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault()
    togglePause()
  }
  if (e.code === 'Period') lab.step(0.05)
})

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (!lab.paused) update(dt * p.timeScale)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
