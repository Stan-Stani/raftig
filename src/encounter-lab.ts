import { EncounterKind, EnemyShip, Game } from './game'
import { initInput } from './input'
import { render } from './render'
import { dist, v, Vec } from './util'

type Station = {
  kind: EncounterKind
  label: string
  icon: string
  note: string
  pos: Vec
  heading: number
  fleet: EnemyShip[]
  spawned: boolean
}

const RING_R = 650
const STAGE_R = 920
const stations: Station[] = [
  { kind: 'convoy', label: 'convoy', icon: '💰', note: 'prize with close escorts', pos: v(-1900, -1100), heading: 0.25, fleet: [], spawned: false },
  { kind: 'pincer', label: 'pincer', icon: '✂', note: 'delayed opposite flank', pos: v(0, -2200), heading: 1.15, fleet: [], spawned: false },
  { kind: 'bombardment', label: 'bombardment', icon: '💣', note: 'screens guard artillery', pos: v(1900, -1100), heading: 2.1, fleet: [], spawned: false },
  { kind: 'fireship-raid', label: 'fireship raid', icon: '🔥', note: 'screen hides timed charge', pos: v(1900, 1100), heading: 3.35, fleet: [], spawned: false },
  { kind: 'patrol', label: 'patrol', icon: '👁', note: 'cross quietly or wake all', pos: v(0, 2200), heading: 4.3, fleet: [], spawned: false },
  { kind: 'broken-fleet', label: 'broken fleet', icon: '🏳', note: 'runners seek reinforcement', pos: v(-1900, 1100), heading: 5.25, fleet: [], spawned: false },
]

const canvas = document.getElementById('encounterLab') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const stationList = document.getElementById('stations')!
const game = new Game()
game.devEncounterLab = true
game.devEncounterAnnouncements = true
game.devGodMode = true
game.helpOpen = false

let dpr = 1
function resize() {
  dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(window.innerWidth * dpr)
  canvas.height = Math.floor(window.innerHeight * dpr)
  canvas.style.width = `${window.innerWidth}px`
  canvas.style.height = `${window.innerHeight}px`
  game.resize(window.innerWidth, window.innerHeight)
}
window.addEventListener('resize', resize)
resize()

function resetRange() {
  game.enemies = []
  game.bullets = []
  game.loot = []
  game.particles = []
  game.texts = []
  game.ship.pos = v(0, 0)
  game.ship.vel = v(0, 0)
  game.ship.a = -Math.PI / 2
  game.ship.hp = game.tierDef().hull
  game.cam = game.ship.pos
  game.camLead = v(0, 0)
  game.shipTrail = []
  game.over = false
  game.paused = false
  game.helpOpen = false
  game.banner = { title: 'encounter range', sub: 'six fresh fleets wait in the marked waters', t: 3 }
  for (const station of stations) {
    station.fleet = []
    station.spawned = false
  }
}

function spawnStation(station: Station) {
  if (station.spawned) return
  station.spawned = true
  station.fleet = game.spawnEncounter({ kind: station.kind, anchor: station.pos, heading: station.heading })
}

function stageApproach(station: Station) {
  // Place the ship just outside the release ring, bow pointed toward its centre.
  const approachA = Math.atan2(station.pos.y, station.pos.x)
  game.ship.pos = v(station.pos.x - Math.cos(approachA) * STAGE_R, station.pos.y - Math.sin(approachA) * STAGE_R)
  game.ship.vel = v(0, 0)
  game.ship.a = approachA
  game.cam = game.ship.pos
  game.camLead = v(0, 0)
  game.shipTrail = []
  game.banner = { title: `${station.icon} ${station.label}`, sub: station.note, t: 2.2 }
}

const buttons = stations.map(station => {
  const button = document.createElement('button')
  button.className = 'station'
  button.innerHTML = `<span>${station.icon}</span><span>${station.label}<br><small>${station.note}</small></span><span class="distance"></span>`
  button.addEventListener('click', () => stageApproach(station))
  stationList.appendChild(button)
  return button
})

document.getElementById('resetRange')!.addEventListener('click', resetRange)
const godButton = document.getElementById('toggleGod') as HTMLButtonElement
godButton.addEventListener('click', () => {
  game.devGodMode = !game.devGodMode
  godButton.textContent = `god: ${game.devGodMode ? 'on' : 'off'}`
})

initInput(canvas, game)
resetRange()

// Handy console surface for automation and one-off behavior probes.
const encounterLab = { game, stations, reset: resetRange, stage: stageApproach, spawn: spawnStation }
;(window as unknown as { __encounterLab: typeof encounterLab }).__encounterLab = encounterLab

function updateStations() {
  // The range is exclusively for authored fleets. This also catches any ship
  // introduced through a console probe or a future procedural-spawn path that
  // does not respect Game.devEncounterLab.
  game.enemies = game.enemies.filter(ship => ship.encounterId != null)
  stations.forEach((station, i) => {
    const d = dist(game.ship.pos, station.pos)
    if (!station.spawned && d <= RING_R) spawnStation(station)
    station.fleet = station.fleet.filter(ship => !ship.sunk)
    buttons[i].classList.toggle('active', station.spawned && station.fleet.length > 0)
    buttons[i].classList.toggle('cleared', station.spawned && station.fleet.length === 0)
    const state = station.spawned ? (station.fleet.length ? `${station.fleet.length} afloat` : 'clear') : `${Math.round(d)}m`
    ;(buttons[i].querySelector('.distance') as HTMLElement).textContent = state
  })
}

function worldToScreen(point: Vec): Vec {
  return v(
    game.vw / 2 + (point.x - game.cam.x - game.camLead.x) * game.camZoom,
    game.vh / 2 + (point.y - game.cam.y - game.camLead.y) * game.camZoom,
  )
}

function drawStations() {
  ctx.save()
  for (const station of stations) {
    const p = worldToScreen(station.pos)
    const rr = RING_R * game.camZoom
    const visible = p.x + rr > 0 && p.x - rr < game.vw && p.y + rr > 0 && p.y - rr < game.vh
    if (visible) {
      ctx.globalAlpha = station.spawned ? 0.16 : 0.34
      ctx.strokeStyle = station.spawned ? '#ff8d72' : '#ffd257'
      ctx.lineWidth = 2
      ctx.setLineDash([9, 10])
      ctx.beginPath()
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 0.9
      ctx.fillStyle = '#e8f1f5'
      ctx.textAlign = 'center'
      ctx.font = 'bold 14px ui-monospace, monospace'
      ctx.fillText(`${station.icon} ${station.label}`, p.x, p.y - 12)
      ctx.fillStyle = '#9fb8c8'
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillText(station.spawned ? (station.fleet.length ? `${station.fleet.length} ships active` : 'cleared') : 'enter ring to release', p.x, p.y + 8)
    }

    // Labeled edge bearings keep every station findable without replacing the
    // actual act of sailing between them.
    if (!visible) {
      const a = Math.atan2(p.y - game.vh / 2, p.x - game.vw / 2)
      const insetX = 100
      const insetY = 48
      const rayX = Math.cos(a)
      const rayY = Math.sin(a)
      const scaleX = Math.abs(rayX) > 0.001 ? (game.vw / 2 - insetX) / Math.abs(rayX) : Infinity
      const scaleY = Math.abs(rayY) > 0.001 ? (game.vh / 2 - insetY) / Math.abs(rayY) : Infinity
      const edgeScale = Math.min(scaleX, scaleY)
      const x = game.vw / 2 + rayX * edgeScale
      const y = game.vh / 2 + rayY * edgeScale
      const distance = Math.round(dist(game.ship.pos, station.pos))

      ctx.font = 'bold 11px ui-monospace, monospace'
      const label = `${station.icon} ${station.label} · ${distance}m`
      const labelW = ctx.measureText(label).width + 16
      ctx.globalAlpha = 0.9
      ctx.fillStyle = 'rgba(4,20,32,.88)'
      ctx.beginPath()
      ctx.roundRect(x - labelW / 2, y - 13, labelW, 26, 13)
      ctx.fill()
      ctx.strokeStyle = station.spawned ? '#ff8d72' : '#ffd257'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#e8f1f5'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x, y)

      const arrowX = x + rayX * (labelW / 2 + 9)
      const arrowY = y + rayY * 18
      ctx.save()
      ctx.translate(arrowX, arrowY)
      ctx.rotate(a)
      ctx.fillStyle = station.spawned ? '#ff8d72' : '#ffd257'
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.moveTo(9, 0)
      ctx.lineTo(-5, -5)
      ctx.lineTo(-5, 5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.restore()
}

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  updateStations()
  game.update(dt)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render(ctx, game)
  drawStations()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
