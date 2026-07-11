import { Vec, v, dist, clamp, rand, randInt, gkey, angleDiff } from './util'
import { Genome, Seed, Pheno, phenotype, wildGenome, breed, makeGenome, carriesRare } from './genetics'
import { Tool, TOOLS, toolbarLayout, seedRowRects, seedPanelRect, restartRect, inRect, SEED_VISIBLE, compPanelRect, compRowRects } from './ui'
import { CompDef, Shot, PALETTE, CLEAR, MAX_SLOTS, compile, buildLabel, flattenShots } from './wand'
import { POI, POI_CELL, POI_SIGHT, cellPOI, makePOI, TRADE_COST, TRADE_RANGE } from './poi'
import { keys } from './input'
import { sfx, toggleMute } from './audio'

export const TS = 46 // legacy sprite scale (trader rafts, bars)
export const RANGE = 280 // baseline reach, px — the inCombat() floor before scanning the deck
export const SPLASH = 44 // mortar burst radius, px
export const PLANT_HP = 40
export const GROW_TIME = 28 // seconds to mature (while watered)
export const WATER_PER_USE = 45 // meter points per 1💧
export const POUCH_CAP = 12 // the bees stop crossing when the seed pouch is this full
export const BOIL_COST = 1 // 🪵 → BOIL_WATER 💧, via the B key — the galley stove
export const BOIL_WATER = 2
export const WIND_MIN = 16 // px/s
export const WIND_MAX = 60
export const TURN_RATE = 1.7 // rad/s — the tiller answers even with no way on
export const AGGRO_R = 330 // raiders notice you inside this range…
export const DEAGGRO_R = 590 // …and give up the chase beyond this
export const NOTICE_T = 1.0 // seconds of ❓ before a raider commits
export const POD_WAKE_R = 340 // committing raiders stir roaming neighbours this close
export const CHASE_PATIENCE = 13 // seconds a hunter presses before you're not worth the powder
export const HUNT_CAP = 3 // ships in full ⚔️ at once — the rest shadow outside gun range
export const DANGER_SCALE = 550 // px from home waters per +1 danger
export const FOG_CELL = 280 // minimap fog-of-war resolution
export const FOG_SIGHT = 640 // radius revealed around the ship

export interface Plant {
  genome: Genome
  gen: number
  pheno: Pheno
  growth: number // 0..1, shoots & breeds at 1
  water: number // 0..100
  /** seconds since last shot that still count as "in action" — full thirst */
  activeT: number
  hp: number
  maxHp: number
  cooldown: number
  dryTime: number
  burnT: number
  poisonT: number
  wobble: number // render phase
  /** fixed firing heading, radians. Hull-relative on your ship (always the mount's
   *  natural facing — the helm is the only traverse); world-fixed on raider ships. */
  aim: number
}

/** a gun mount bolted to the deck — local coords, prow = +x */
export interface Mount {
  x: number
  y: number
  aim0: number // the mount's natural facing; new plants point this way
  plant: Plant | null
  /** rigged components (Noita-style wand slots); [] = fires the plant's bare gun */
  components: CompDef[]
}

export interface HullTier {
  name: string
  hull: number // max hull hp
  cost: number // 🪵 to refit up into this tier
  len: number // half-length, px
  beam: number // half-width, px
  mounts: { x: number; y: number; aim: number }[]
}

/** the shipwright's ladder: each refit keeps your plants (mount for mount) and
 *  adds fresh ones — bow chasers first, then broadsides, then a stern chaser */
export const TIERS: HullTier[] = [
  {
    name: 'skiff',
    hull: 140,
    cost: 0,
    len: 54,
    beam: 30,
    mounts: [
      { x: -4, y: -14, aim: -Math.PI / 2 },
      { x: -4, y: 14, aim: Math.PI / 2 },
    ],
  },
  {
    name: 'sloop',
    hull: 220,
    cost: 30,
    len: 70,
    beam: 36,
    mounts: [
      { x: -12, y: -18, aim: -Math.PI / 2 },
      { x: -12, y: 18, aim: Math.PI / 2 },
      { x: 34, y: 0, aim: 0 },
    ],
  },
  {
    name: 'brig',
    hull: 320,
    cost: 70,
    len: 88,
    beam: 44,
    mounts: [
      { x: 4, y: -24, aim: -Math.PI / 2 },
      { x: 4, y: 24, aim: Math.PI / 2 },
      { x: 48, y: 0, aim: 0 },
      { x: -42, y: -22, aim: -Math.PI / 2 },
      { x: -42, y: 22, aim: Math.PI / 2 },
    ],
  },
  {
    name: 'galleon',
    hull: 460,
    cost: 140,
    len: 106,
    beam: 52,
    mounts: [
      { x: 18, y: -30, aim: -Math.PI / 2 },
      { x: 18, y: 30, aim: Math.PI / 2 },
      { x: 62, y: 0, aim: 0 },
      { x: -32, y: -30, aim: -Math.PI / 2 },
      { x: -32, y: 30, aim: Math.PI / 2 },
      { x: -74, y: 0, aim: Math.PI },
    ],
  },
]

/** a raider gun — world-aligned local offset from the ship's center */
export interface EGun {
  x: number
  y: number
  plant: Plant
}

export interface EnemyShip {
  pos: Vec
  vel: Vec
  hp: number
  maxHp: number
  r: number // hull radius
  size: number // loot scale (the old raft's plank count)
  burnT: number
  chillT: number
  guns: EGun[]
  orbitDir: number
  speed: number
  /** roam → notice (❓, turning toward you) → hunt (⚔️, committed) */
  mode: 'roam' | 'notice' | 'hunt'
  noticeT: number
  /** distance to the player when it noticed — pod-woken ships come look from afar */
  noticeD: number
  aggroR: number
  deaggroR: number
  wanderA: number
  wanderT: number
  /** seconds of hunt left before breaking off — refreshed by landing or taking hits */
  patience: number
  /** harrier oar stamina 0..1 — sprints drain it, rest refills it */
  row: number
  danger: number // difficulty of the waters it spawned in
  /** harriers row — fast in any wind, but small and fragile */
  kind: 'raider' | 'harrier'
  /** ship belongs to a nest and stays tethered to it */
  home?: POI
  /** holds one of the HUNT_CAP attack slots — shadowers wait outside gun range */
  engaged?: boolean
  /** mid-scuttle guard — the hull is going down, don't re-enter */
  scuttling?: boolean
  sunk?: boolean
}

export interface Wind {
  a: number // blowing toward this angle
  speed: number
  targetA: number
  targetSpeed: number
  shiftT: number
}

/** every shot afloat is a mortar shell: it arcs over everything between the
 *  muzzle and the drop point, then bursts — there is nothing to hit en route */
export interface Bullet {
  pos: Vec
  vel: Vec
  dmg: number
  element: Pheno['element']
  quirk: Pheno['quirk']
  friendly: boolean
  /** flight time remaining, s — the shell bursts when it runs out */
  life: number
  /** where the shell comes down */
  drop: Vec
  /** total flight time, s — the render arc reads progress off it */
  flightT: number
  /** burst radius at the drop point, px */
  splash: number
  src?: Plant
  /** the ship that fired an enemy shell — a burst that tells renews its patience */
  owner?: EnemyShip
  /** rigged: shell curves toward the nearest raider in flight */
  homing?: boolean
  /** rigged: firing heading, so a trigger's payload radiates from the burst */
  heading?: number
  /** rigged: shots cast at this shell's burst point (airburst trigger) */
  payload?: Shot[]
}

export type LootKind = 'wood' | 'seed' | 'water'
export interface Loot {
  kind: LootKind
  n: number
  seed?: Seed
  pos: Vec
  vel: Vec
  ttl: number
  phase: number
}

export interface Particle {
  pos: Vec
  vel: Vec
  life: number
  maxLife: number
  size: number
  color: string
}

export interface FloatText {
  pos: Vec
  text: string
  life: number
  color: string
}

export interface HoverInfo {
  plant: Plant
  hostile: boolean
  pos: Vec
}

function makePlant(genome: Genome, gen: number, growth = 0): Plant {
  return {
    genome,
    gen,
    pheno: phenotype(genome),
    growth,
    water: 70,
    activeT: 0,
    hp: PLANT_HP,
    maxHp: PLANT_HP,
    cooldown: rand(0.3, 1),
    dryTime: 0,
    burnT: 0,
    poisonT: 0,
    wobble: rand(Math.PI * 2),
    aim: -Math.PI / 2, // overwritten at sowing with the mount's facing
  }
}

export class Game {
  vw = 800
  vh = 600
  time = 0

  /** a: hull heading, radians — the prow points along it and every mount turns with it */
  ship = { pos: v(0, 0), vel: v(0, 0), a: 0, hp: TIERS[0].hull }
  tier = 0
  mounts: Mount[] = []
  /** the hull is alight — hp burns off until it gutters out */
  burnT = 0

  wood = 0
  water = 0
  seeds: Seed[] = []
  seedId = 1

  enemies: EnemyShip[] = []
  bullets: Bullet[] = []
  loot: Loot[] = []
  particles: Particle[] = []
  texts: FloatText[] = []

  wind: Wind = { a: 0, speed: 30, targetA: 0, targetSpeed: 30, shiftT: 8 }
  sailEff: number | null = null // sailing efficiency while steering, for the HUD
  ambientT = 2
  spawnT = 3

  /** materialized POIs by world cell (null = cell checked, empty) */
  pois = new Map<string, POI | null>()
  /** POIs near enough to simulate / render this frame */
  activePois: POI[] = []
  /** fog-of-war: minimap cells the ship has sailed near */
  seen = new Set<string>()
  fogT = 0

  tool: Tool = 'water'
  seedSel = 0
  seedScroll = 0
  compSel = 1 // selected component in the rig palette (0 = ✕ clear)
  pollenT = 20 // seconds until the bees next work the deck

  firing = false // set by the fire key, consumed each frame → one broadside per press
  chillT = 0 // frost debuff on our ship
  shake = 0
  cam = v(0, 0)
  hover = v(0, 0) // world coords of pointer
  hoverScreen = v(0, 0)
  hoverInfo: HoverInfo | null = null

  over = false
  paused = false
  helpOpen = true
  banner = { title: '', sub: '', t: 0 }
  stats = { sunk: 0, bred: 0, time: 0, far: 0 }

  constructor() {
    this.reset()
    this.helpOpen = true
  }

  reset() {
    this.tier = 0
    this.ship = { pos: v(0, 0), vel: v(0, 0), a: 0, hp: TIERS[0].hull }
    this.mounts = TIERS[0].mounts.map(m => ({ x: m.x, y: m.y, aim0: m.aim, plant: null, components: [] }))
    this.burnT = 0
    // one half-grown basic shooter on the port mount so wave 1 is survivable
    const starter = makePlant(makeGenome(), 0, 0.55)
    starter.aim = this.mounts[0].aim0
    this.mounts[0].plant = starter

    this.wood = 8
    this.water = 6
    this.seedId = 1
    // you set sail with one plant and an empty pouch — the first seed is out
    // there: flotsam, a trader, a wreck, or a raider's gun line
    this.seeds = []

    this.enemies = []
    this.bullets = []
    this.loot = []
    this.particles = []
    this.texts = []
    const wa = rand(Math.PI * 2)
    this.wind = { a: wa, speed: rand(26, 44), targetA: wa, targetSpeed: rand(26, 44), shiftT: rand(7, 15) }
    this.sailEff = null
    this.ambientT = 2
    this.spawnT = 3
    this.pois = new Map()
    this.activePois = []
    this.seen = new Set()
    this.fogT = 0
    // a guaranteed first sight: smoke on the horizon in a random direction
    const swa = rand(Math.PI * 2)
    this.pois.set('start', makePOI('wreck', v(Math.cos(swa) * 700, Math.sin(swa) * 700)))
    this.tool = 'water'
    this.seedSel = 0
    this.seedScroll = 0
    this.compSel = 1
    this.pollenT = 20
    this.chillT = 0
    this.shake = 0
    this.over = false
    this.paused = false
    this.helpOpen = false
    this.stats = { sunk: 0, bred: 0, time: 0, far: 0 }
    this.banner = { title: 'raftig', sub: 'hoist the sail — raiders roam these waters', t: 4 }
    for (let i = 0; i < 3; i++) this.spawnEnemyShip()
  }

  resize(w: number, h: number) {
    this.vw = w
    this.vh = h
  }

  // ---- coordinates ----

  tierDef(): HullTier {
    return TIERS[this.tier]
  }

  /** mount local coords → world: the deck turns with the heading (+x is the prow) */
  mountPos(m: { x: number; y: number }): Vec {
    const c = Math.cos(this.ship.a)
    const s = Math.sin(this.ship.a)
    return v(this.ship.pos.x + m.x * c - m.y * s, this.ship.pos.y + m.x * s + m.y * c)
  }

  /** world point → ship-local px — the inverse of mountPos */
  worldToLocal(w: Vec): Vec {
    const c = Math.cos(this.ship.a)
    const s = Math.sin(this.ship.a)
    const dx = w.x - this.ship.pos.x
    const dy = w.y - this.ship.pos.y
    return v(dx * c + dy * s, dy * c - dx * s)
  }

  /** true if a world point lies on (or within pad px of) the hull ellipse */
  onHull(w: Vec, pad = 0): boolean {
    const l = this.worldToLocal(w)
    const t = this.tierDef()
    const a = t.len + pad
    const b = t.beam + pad
    return (l.x * l.x) / (a * a) + (l.y * l.y) / (b * b) <= 1
  }

  gunPos(e: EnemyShip, g: EGun): Vec {
    return v(e.pos.x + g.x, e.pos.y + g.y)
  }

  screenToWorld(mx: number, my: number): Vec {
    return v(this.cam.x + mx - this.vw / 2, this.cam.y + my - this.vh / 2)
  }

  /** difficulty of the waters at p — grows with distance from home (the spawn point) */
  dangerAt(p: Vec): number {
    return 1 + dist(p, v(0, 0)) / DANGER_SCALE
  }

  /** local wind multiplier: 1 in open water, ~0.12 deep inside a becalmed pool */
  calmAt(p: Vec): number {
    let f = 1
    for (const poi of this.activePois) {
      if (poi.kind !== 'calm') continue
      const d = dist(p, poi.pos)
      if (d >= poi.r) continue
      const inner = poi.r * 0.55
      const t = clamp((d - inner) / (poi.r - inner), 0, 1)
      f = Math.min(f, 0.12 + 0.88 * t)
    }
    return f
  }

  /** any watered magnet plant on deck pulls loot in */
  magnetActive(): boolean {
    for (const m of this.mounts) {
      const p = m.plant
      if (p && p.growth >= 1 && p.water > 0 && p.pheno.quirk === 'magnet') return true
    }
    return false
  }

  // ---- update ----

  update(dt: number) {
    this.cam = this.ship.pos
    this.hover = this.screenToWorld(this.hoverScreen.x, this.hoverScreen.y)
    if (this.over || this.paused || this.helpOpen) {
      this.updateFx(dt)
      return
    }
    this.time += dt
    this.stats.time += dt
    this.chillT = Math.max(0, this.chillT - dt)

    this.updateWind(dt)
    this.updatePOIs(dt)
    this.updateMovement(dt)
    this.updateShip(dt)
    this.updatePollination(dt)
    this.updateEnemies(dt)
    this.updateBullets(dt)
    this.updateLoot(dt)
    this.updateSea(dt)
    this.updateHoverInfo()
    this.updateFx(dt)
    this.stats.far = Math.max(this.stats.far, dist(this.ship.pos, v(0, 0)))
  }

  private updateWind(dt: number) {
    const w = this.wind
    w.shiftT -= dt
    if (w.shiftT <= 0) {
      w.shiftT = rand(7, 15)
      w.targetA = w.a + rand(-1.4, 1.4)
      w.targetSpeed = clamp(w.targetSpeed + rand(-16, 16), WIND_MIN, WIND_MAX)
    }
    const ease = Math.min(1, 0.4 * dt)
    w.a += angleDiff(w.targetA, w.a) * ease
    w.speed += (w.targetSpeed - w.speed) * ease
  }

  // ---- points of interest ----

  private updatePOIs(dt: number) {
    const c = this.ship.pos
    const R = 2600
    // materialize any cell POIs coming into simulation range
    const cx0 = Math.floor((c.x - R) / POI_CELL)
    const cx1 = Math.floor((c.x + R) / POI_CELL)
    const cy0 = Math.floor((c.y - R) / POI_CELL)
    const cy1 = Math.floor((c.y + R) / POI_CELL)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = gkey(cx, cy)
        if (!this.pois.has(key)) this.pois.set(key, cellPOI(cx, cy))
      }
    }
    this.activePois = []
    for (const p of this.pois.values()) {
      if (p && dist(p.pos, c) < R) this.activePois.push(p)
    }

    for (const p of this.activePois) {
      const d = dist(p.pos, c)
      if (!p.discovered && d < POI_SIGHT[p.kind]) p.discovered = true
      if (p.done) continue
      if (p.kind === 'wreck' && d < p.r) this.salvageWreck(p)
      if (p.kind === 'nest' && !p.nestUp && d < 1250) this.spawnNest(p)
      if (p.kind === 'calm' && !p.seeded && d < POI_SIGHT.calm) this.seedCalm(p)
    }

    // fog of war: reveal the waters around the ship
    this.fogT -= dt
    if (this.fogT <= 0) {
      this.fogT = 0.35
      const g0x = Math.floor((c.x - FOG_SIGHT) / FOG_CELL)
      const g1x = Math.floor((c.x + FOG_SIGHT) / FOG_CELL)
      const g0y = Math.floor((c.y - FOG_SIGHT) / FOG_CELL)
      const g1y = Math.floor((c.y + FOG_SIGHT) / FOG_CELL)
      for (let gx = g0x; gx <= g1x; gx++) {
        for (let gy = g0y; gy <= g1y; gy++) {
          const px = (gx + 0.5) * FOG_CELL
          const py = (gy + 0.5) * FOG_CELL
          if (dist(v(px, py), c) < FOG_SIGHT + FOG_CELL * 0.4) this.seen.add(gkey(gx, gy))
        }
      }
    }
  }

  /** one-time fat salvage — the reward outpaces the danger of getting here */
  private salvageWreck(p: POI) {
    p.done = true
    const danger = this.dangerAt(p.pos)
    const scatter = () => v(p.pos.x + rand(-75, 75), p.pos.y + rand(-75, 75))
    const wood = 6 + Math.floor(danger * 1.5)
    for (let left = wood; left > 0; ) {
      const n = Math.min(left, randInt(2, 4))
      this.dropLoot('wood', n, scatter())
      left -= n
    }
    this.dropLoot('water', 3 + Math.floor(danger / 2), scatter())
    const nSeeds = 1 + (danger >= 4 ? 1 : 0)
    for (let i = 0; i < nSeeds; i++) {
      this.dropLoot('seed', 1, scatter(), { id: this.seedId++, genome: wildGenome(1 + danger * 0.5), gen: 0 })
    }
    this.burst(p.pos, '#ffb74d', 14)
    this.toastAt(p.pos, '⚓ salvage!', '#ffd257')
    this.shake = Math.min(8, this.shake + 3)
    sfx('salvage')
  }

  /** wake the nest: a tethered pod of raiders guarding the best wild genes */
  private spawnNest(p: POI) {
    p.nestUp = true
    const n = randInt(3, 4)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(0.8)
      const at = v(p.pos.x + Math.cos(a) * rand(120, 260), p.pos.y + Math.sin(a) * rand(120, 260))
      this.spawnEnemyShip({ at, home: p, dangerBonus: 2 })
    }
  }

  private nestCleared(p: POI) {
    if (p.done) return
    p.done = true
    const danger = this.dangerAt(p.pos) + 2
    const scatter = () => v(p.pos.x + rand(-60, 60), p.pos.y + rand(-60, 60))
    for (let i = 0; i < 2 + (danger >= 7 ? 1 : 0); i++) {
      this.dropLoot('seed', 1, scatter(), { id: this.seedId++, genome: wildGenome(2 + danger * 0.5), gen: 0 })
    }
    this.dropLoot('wood', randInt(5, 8), scatter())
    this.dropLoot('water', 3, scatter())
    this.banner = { title: 'nest cleared!', sub: 'their hoarded lines drift free — gather the seeds', t: 3.5 }
    this.burst(p.pos, '#ff6b6b', 16)
    sfx('sunk')
  }

  /** becalmed pools collect drifting flotsam — rich pickings, slow escape */
  private seedCalm(p: POI) {
    p.seeded = true
    const danger = this.dangerAt(p.pos)
    const n = randInt(3, 5)
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2)
      const at = v(p.pos.x + Math.cos(a) * rand(0, p.r * 0.5), p.pos.y + Math.sin(a) * rand(0, p.r * 0.5))
      const roll = Math.random()
      if (roll < 0.5) this.dropLoot('wood', randInt(2, 3), at)
      else if (roll < 0.88) this.dropLoot('water', 2, at)
      else this.dropLoot('seed', 1, at, { id: this.seedId++, genome: wildGenome(1 + danger * 0.4), gen: 0 })
    }
    for (const l of this.loot.slice(-n)) {
      l.ttl = 999
      l.vel = v(0, 0)
    }
  }

  /** barter with a trader raft in range (T) — wood for good seed lines */
  tryTrade() {
    const c = this.ship.pos
    for (const p of this.activePois) {
      if (p.kind !== 'trader' || p.done || dist(p.pos, c) > TRADE_RANGE) continue
      if (this.wood < TRADE_COST) return this.toast(`trader wants ${TRADE_COST}🪵`)
      this.wood -= TRADE_COST
      p.stock--
      const danger = this.dangerAt(p.pos)
      const seed = { id: this.seedId++, genome: wildGenome(1.4 + danger * 0.4), gen: 0 }
      this.seeds.push(seed)
      this.toastAt(p.pos, `🌰 ${phenotype(seed.genome).name}`, '#b8e986')
      if (p.stock <= 0) {
        p.done = true
        this.toastAt(v(p.pos.x, p.pos.y - 24), 'sold out — fair winds!', '#9fb8c8')
      }
      sfx('breed')
      return
    }
  }

  private updateFx(dt: number) {
    this.shake = Math.max(0, this.shake - this.shake * 5 * dt - 2 * dt)
    this.banner.t = Math.max(0, this.banner.t - dt)
    for (const p of this.particles) {
      p.pos.x += p.vel.x * dt
      p.pos.y += p.vel.y * dt
      p.vel.x *= 1 - 2 * dt
      p.vel.y *= 1 - 2 * dt
      p.life -= dt
    }
    this.particles = this.particles.filter(p => p.life > 0)
    for (const t of this.texts) {
      t.pos.y -= 22 * dt
      t.life -= dt
    }
    this.texts = this.texts.filter(t => t.life > 0)
  }

  private updateMovement(dt: number) {
    const left = keys.has('KeyA') || keys.has('ArrowLeft')
    const right = keys.has('KeyD') || keys.has('ArrowRight')
    const fwd = keys.has('KeyW') || keys.has('ArrowUp')
    const back = keys.has('KeyS') || keys.has('ArrowDown')
    // the tiller: A/D swing the prow, the hull (and every gun on it) turns with it
    if (left !== right) this.ship.a += (right ? 1 : -1) * TURN_RATE * dt
    this.sailEff = null
    // becalmed pools starve the sail — rowing raiders don't care
    const calm = this.calmAt(this.ship.pos)
    const gust = (0.5 + (0.5 * (this.wind.speed * calm)) / WIND_MAX) * (0.45 + 0.55 * calm)
    if (fwd) {
      // sheet in: way comes on along the prow. Sail physics — full speed running
      // with the wind, a crawl beating into it; tack across the wind (or wait for
      // it to shift) instead of fighting it head-on
      const eff = 0.3 + 0.7 * Math.pow((1 + Math.cos(angleDiff(this.ship.a, this.wind.a))) / 2, 1.5)
      this.sailEff = eff
      const maxSpeed = 120 * eff * gust * (this.chillT > 0 ? 0.55 : 1)
      this.ship.vel.x += Math.cos(this.ship.a) * 260 * eff * gust * dt
      this.ship.vel.y += Math.sin(this.ship.a) * 260 * eff * gust * dt
      const sp = Math.hypot(this.ship.vel.x, this.ship.vel.y)
      if (sp > maxSpeed) {
        this.ship.vel.x *= maxSpeed / sp
        this.ship.vel.y *= maxSpeed / sp
      }
    } else if (back) {
      // back water: the crew rows astern — kills way fast, then slow sternway.
      // No sail involved, so calm pools and headwinds don't matter
      this.ship.vel.x *= 1 - Math.min(1, 2.2 * dt)
      this.ship.vel.y *= 1 - Math.min(1, 2.2 * dt)
      const sternway = -(this.ship.vel.x * Math.cos(this.ship.a) + this.ship.vel.y * Math.sin(this.ship.a))
      if (sternway < 42) {
        this.ship.vel.x -= Math.cos(this.ship.a) * 100 * dt
        this.ship.vel.y -= Math.sin(this.ship.a) * 100 * dt
      }
    }
    // the keel swings momentum in behind the prow — the hull carves, not skates
    const sp = Math.hypot(this.ship.vel.x, this.ship.vel.y)
    if (sp > 4) {
      const va = Math.atan2(this.ship.vel.y, this.ship.vel.x)
      const target = Math.cos(angleDiff(va, this.ship.a)) >= 0 ? this.ship.a : this.ship.a + Math.PI
      const na = va + clamp(angleDiff(target, va), -1.5 * dt, 1.5 * dt)
      this.ship.vel.x = Math.cos(na) * sp
      this.ship.vel.y = Math.sin(na) * sp
    }
    this.ship.vel.x *= 1 - Math.min(1, 1.4 * dt)
    this.ship.vel.y *= 1 - Math.min(1, 1.4 * dt)
    this.ship.pos.x += this.ship.vel.x * dt
    this.ship.pos.y += this.ship.vel.y * dt
  }

  private updateShip(dt: number) {
    // hull afire — hp burns off until the flames gutter out
    if (this.burnT > 0) {
      this.burnT -= dt
      this.ship.hp -= 5 * dt
      if (Math.random() < 6 * dt) {
        const t = this.tierDef()
        this.puff(this.mountPos({ x: rand(-t.len * 0.7, t.len * 0.7), y: rand(-t.beam * 0.6, t.beam * 0.6) }), '#ff8c42', 1)
      }
      if (this.ship.hp <= 0) return this.gameOver()
    }
    // out of the fight the crew patches the hull — same rule the raiders play by
    const fighting = this.inCombat()
    if (!fighting && this.burnT <= 0 && this.ship.hp < this.tierDef().hull) {
      this.ship.hp = Math.min(this.tierDef().hull, this.ship.hp + 3 * dt)
      if (Math.random() < 1.2 * dt) this.puff(this.ship.pos, '#b8e986', 1)
    }

    for (const m of this.mounts) {
      const p = m.plant
      if (!p) continue

      // growth & thirst — plants gulp in battle, only sip at rest
      if (p.water > 0) {
        p.growth = Math.min(1, p.growth + dt / (GROW_TIME * p.pheno.growMult))
        p.dryTime = 0
      } else {
        p.dryTime += dt
        if (p.dryTime > 6) p.hp -= 2 * dt
      }
      p.activeT = Math.max(0, p.activeT - dt)
      const thirst = p.growth < 1 ? 0.6 : p.activeT > 0 ? 1 : 0.2
      p.water = Math.max(0, p.water - p.pheno.drain * thirst * dt)

      // damage over time
      if (p.burnT > 0) {
        p.burnT -= dt
        p.hp -= 3 * dt
      }
      if (p.poisonT > 0) {
        p.poisonT -= dt
        p.hp -= 2.5 * dt
      }
      // the gardener splints scorched stems once the shooting stops
      if (!fighting && p.burnT <= 0 && p.poisonT <= 0 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 2.5 * dt)
      }
      if (p.hp <= 0) {
        m.plant = null
        this.toastAt(this.mountPos(m), '🥀', '#c5b8a0')
        continue
      }

      p.cooldown -= dt // reload timer ticks down whether or not you fire

      // manual fire: mortars hold along their mount's fixed facing until YOU pull
      // the lanyard (Space). Each shell bursts exactly at the plant's bred reach —
      // no aiming, no range gate: the helm walks the burst rings over a target,
      // the reach gene picks the ring, and firing starts the rate-gene reload.
      if (this.firing && p.growth >= 1 && p.water > 0 && p.cooldown <= 0) {
        const slow = this.firePlant(m, this.mountPos(m))
        p.cooldown = p.pheno.period * slow * (this.chillT > 0 ? 1.35 : 1)
        p.water = Math.max(0, p.water - 0.35)
      }
    }
    this.firing = false // consumed this frame; a fresh press re-arms it
    if (this.ship.hp <= 0 && !this.over) this.gameOver()
  }

  /** the bees work the deck: every so often two mature, watered plants quietly
   *  cross into a fresh seed — no tool, no cost. What you choose to field IS the
   *  breeding program. Bees keep to the hive under fire, and rest once the pouch
   *  is full, so the drip never floods you */
  private updatePollination(dt: number) {
    if (this.inCombat()) return
    this.pollenT -= dt
    if (this.pollenT > 0) return
    this.pollenT = rand(32, 48)
    if (this.seeds.length >= POUCH_CAP) return
    const mature = this.mounts
      .map(m => m.plant)
      .filter((p): p is Plant => !!p && p.growth >= 1 && p.water > 0)
    if (mature.length < 2) return
    const i = randInt(0, mature.length - 1)
    const j = (i + 1 + randInt(0, mature.length - 2)) % mature.length
    const a = mature[i]
    const b = mature[j]
    const gen = Math.max(a.gen, b.gen) + 1
    const make = () => ({ id: this.seedId++, genome: breed(a.genome, b.genome), gen })
    this.seeds.push(make())
    let msg = `🐝 ${phenotype(this.seeds[this.seeds.length - 1].genome).name}`
    if (Math.random() < 0.25) {
      this.seeds.push(make())
      msg += ' ×2'
    }
    this.stats.bred++
    this.toastAt(this.ship.pos, `${msg} (F${gen})`, '#ffd257')
    sfx('breed')
  }

  /** true while a raider sits within gun range of the ship — locks refits */
  inCombat(): boolean {
    // the longest glass on deck decides when the fight has started
    let reach = RANGE
    for (const m of this.mounts) {
      if (m.plant) reach = Math.max(reach, m.plant.pheno.range)
    }
    for (const e of this.enemies) {
      if (dist(this.ship.pos, e.pos) - e.r - this.tierDef().len < reach) return true
    }
    return false
  }

  /** burst radius of a plant's shells — the pierce quirk packs shrapnel */
  plantSplash(p: Plant): number {
    return SPLASH * (p.pheno.quirk === 'pierce' ? 1.45 : 1)
  }

  /** pull the lanyard on one mount. A rigged mount runs its compiled component
   *  stack; a bare mount fires the plant's own gene-gun (the old behaviour).
   *  Returns the cycle-time multiplier — heavier / busier builds reload slower. */
  private firePlant(m: Mount, from: Vec): number {
    const p = m.plant!
    p.activeT = 4
    const heading = this.ship.a + p.aim // hull-relative: turning walks the burst
    const shots = m.components.length ? compile(m.components) : []
    if (shots.length) {
      const base = { range: p.pheno.range, dmg: p.pheno.dmg, splash: SPLASH, element: p.pheno.element, speed: 260 }
      for (const shot of shots) this.spawnShot(shot, from, heading, base, true, p, true)
      this.puff(v(from.x, from.y - 16), '#fff3c4', 2)
      if (Math.random() < 0.7) sfx('shoot')
      const flat = flattenShots(shots)
      const maxSlow = flat.reduce((s, sh) => Math.max(s, sh.slow), 1)
      return maxSlow * (1 + 0.12 * Math.max(0, flat.length - 1)) // more shells → longer reload
    }
    const spread = p.pheno.spread // barrel-gene spread: extra barrels fan their bursts
    const speed = 260 // shells hang in the air — lead a moving target
    for (let i = 0; i < p.pheno.shots; i++) {
      const a = heading + (i - (p.pheno.shots - 1) / 2) * spread
      // the reach gene IS the rangefinder: every shell bursts at its bred distance
      const drop = v(from.x + Math.cos(a) * p.pheno.range + rand(-7, 7), from.y + Math.sin(a) * p.pheno.range + rand(-7, 7))
      const pos = v(from.x, from.y - 16)
      const flightT = dist(from, drop) / speed
      this.bullets.push({
        pos,
        vel: v((drop.x - pos.x) / flightT, (drop.y - pos.y) / flightT),
        dmg: p.pheno.dmg,
        element: p.pheno.element,
        quirk: p.pheno.quirk,
        friendly: true,
        life: flightT,
        src: p,
        drop,
        flightT,
        splash: this.plantSplash(p),
      })
    }
    this.puff(v(from.x, from.y - 16), '#fff3c4', 2)
    if (Math.random() < 0.7) sfx('shoot')
    return 1
  }

  /** launch one compiled shot: a shell (maybe fanned) that may carry a payload
   *  cast at its burst point. Shared by the initial pull and airburst payloads. */
  private spawnShot(shot: Shot, from: Vec, heading: number, base: { range: number; dmg: number; splash: number; element: Pheno['element']; speed: number }, friendly: boolean, src: Plant | undefined, muzzle: boolean) {
    const range = base.range * shot.rangeMult
    for (let k = 0; k < shot.fan; k++) {
      const a = heading + (k - (shot.fan - 1) / 2) * shot.spread
      const drop = v(from.x + Math.cos(a) * range + rand(-7, 7), from.y + Math.sin(a) * range + rand(-7, 7))
      const pos = muzzle ? v(from.x, from.y - 16) : v(from.x, from.y)
      const flightT = Math.max(0.05, dist(pos, drop) / base.speed)
      this.bullets.push({
        pos,
        vel: v((drop.x - pos.x) / flightT, (drop.y - pos.y) / flightT),
        dmg: base.dmg * shot.dmgMult,
        element: shot.element ?? base.element,
        quirk: shot.pierce ? 'pierce' : 'none',
        friendly,
        life: flightT,
        src,
        drop,
        flightT,
        splash: base.splash * shot.splashMult,
        homing: shot.homing,
        heading: a,
        payload: shot.payload.length ? shot.payload : undefined,
      })
    }
  }

  /** B — the galley stove: burn wood, condense fresh water. No building required */
  boil() {
    if (this.over || this.paused || this.helpOpen) return
    if (this.wood < BOIL_COST) return this.toast(`need ${BOIL_COST}🪵 to boil`)
    this.wood -= BOIL_COST
    this.water += BOIL_WATER
    this.toastAt(this.ship.pos, `+${BOIL_WATER}💧`, '#7fd8ff')
    this.puff(v(this.ship.pos.x, this.ship.pos.y - 20), '#cfd8dc', 4)
    sfx('build')
  }

  /** U — refit to the next hull: more deck, more mounts, plants carried across */
  upgradeHull() {
    if (this.over || this.paused || this.helpOpen) return
    if (this.tier >= TIERS.length - 1) return this.toast("she's a galleon already")
    if (this.inCombat()) return this.toast('refit only out of combat')
    const next = TIERS[this.tier + 1]
    if (this.wood < next.cost) return this.toast(`refit needs ${next.cost}🪵`)
    this.wood -= next.cost
    this.tier++
    this.ship.hp = next.hull
    const old = this.mounts
    this.mounts = next.mounts.map((md, i) => ({ x: md.x, y: md.y, aim0: md.aim, plant: old[i]?.plant ?? null, components: old[i]?.components ?? [] }))
    this.banner = { title: `${next.name}!`, sub: `${next.mounts.length} gun mounts · hull ${next.hull}`, t: 3 }
    this.burst(this.ship.pos, '#e8c98a', 16)
    this.shake = Math.min(8, this.shake + 3)
    sfx('build')
  }

  // ---- enemies ----

  spawnEnemyShip(opts: { at?: Vec; kind?: EnemyShip['kind']; home?: POI; dangerBonus?: number } = {}) {
    const c = this.ship.pos
    let pos = opts.at
    if (!pos) {
      const angle = rand(Math.PI * 2)
      const away = rand(650, 1000)
      pos = v(c.x + Math.cos(angle) * away, c.y + Math.sin(angle) * away)
    }
    const danger = this.dangerAt(pos) + (opts.dangerBonus ?? 0)
    const kind =
      opts.kind ??
      (danger > 2 && Math.random() < Math.min(0.3, 0.04 + danger * 0.035) ? 'harrier' : 'raider')
    const size = kind === 'harrier' ? 2 : randInt(2, Math.min(2 + Math.ceil(danger / 2), 6))
    const r = 20 + size * 6
    const maxHp = size * (kind === 'harrier' ? 20 + danger * 3.5 : 26 + danger * 5)
    let gunCount =
      kind === 'harrier' ? 1 : 1 + (size >= 4 ? 1 : 0) + (danger >= 6 && size >= 5 ? 1 : 0) + (opts.home ? 1 : 0)
    const guns: EGun[] = []
    // guns are bolted to the hull, ship-cannon style: batteries share an axis and
    // alternate port/starboard — the ship has to maneuver to bring one to bear
    const gunA = rand(Math.PI * 2)
    for (let i = 0; i < gunCount; i++) {
      const pa = (i / gunCount) * Math.PI * 2 + rand(0.6)
      const pd = gunCount === 1 ? 0 : r * 0.45
      const plant = makePlant(wildGenome((opts.home ? 1.6 : 1) + danger * 0.4), 0, 1)
      plant.water = 100
      plant.aim = gunA + (i % 2) * Math.PI + rand(-0.15, 0.15)
      guns.push({ x: Math.cos(pa) * pd, y: Math.sin(pa) * pd, plant })
    }
    this.enemies.push({
      pos,
      vel: v(0, 0),
      hp: maxHp,
      maxHp,
      r,
      size,
      burnT: 0,
      chillT: 0,
      guns,
      orbitDir: Math.random() < 0.5 ? 1 : -1,
      speed: kind === 'harrier' ? 92 + Math.min(18, danger * 2.5) : Math.min(80, 40 + danger * 3 + rand(10)),
      mode: 'roam',
      noticeT: 0,
      noticeD: 0,
      aggroR: kind === 'harrier' ? 380 : AGGRO_R,
      deaggroR: kind === 'harrier' ? 820 : DEAGGRO_R,
      wanderA: rand(Math.PI * 2),
      wanderT: rand(2, 6),
      patience: CHASE_PATIENCE,
      row: 1,
      danger,
      kind,
      home: opts.home,
    })
  }

  /** some sails travel in pods — waking one means waking the neighbourhood */
  private spawnPod() {
    const c = this.ship.pos
    const angle = rand(Math.PI * 2)
    const away = rand(700, 1050)
    const anchor = v(c.x + Math.cos(angle) * away, c.y + Math.sin(angle) * away)
    const n = randInt(2, 3)
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2)
      this.spawnEnemyShip({ at: v(anchor.x + Math.cos(a) * rand(90, 180), anchor.y + Math.sin(a) * rand(90, 180)) })
    }
  }

  private notice(e: EnemyShip, t = NOTICE_T) {
    if (e.mode !== 'roam') return
    e.mode = 'notice'
    e.noticeT = e.kind === 'harrier' ? t * 0.6 : t
    e.noticeD = dist(e.pos, this.ship.pos)
    this.toastAt(e.pos, '❓', '#ffd257')
    sfx('notice')
  }

  aggro(e: EnemyShip) {
    if (e.mode === 'hunt') return
    e.mode = 'hunt'
    e.patience = CHASE_PATIENCE
    // committing from afar (pod wake, long shots) mustn't fizzle the next frame
    e.deaggroR = Math.max(e.deaggroR, dist(e.pos, this.ship.pos) + 240)
    this.toastAt(e.pos, '⚔️ committed!', '#ff9d9d')
    sfx('spot')
    // stirring one ship wakes its podmates — pick where you engage
    for (const o of this.enemies) {
      if (o !== e && o.mode === 'roam' && dist(o.pos, e.pos) < POD_WAKE_R) this.notice(o, rand(0.7, 1.2))
    }
  }

  private updateEnemies(dt: number) {
    const center = this.ship.pos
    // only a few press the attack — the rest shadow outside gun range and wait
    // for a slot. Slots are sticky (held until the hunter breaks off or sinks)
    // so the pack doesn't churn; fights stay fights, not dogpiles
    let slots = 0
    for (const e of this.enemies) {
      if (e.mode !== 'hunt') e.engaged = false
      else if (e.engaged) slots++
    }
    if (slots < HUNT_CAP) {
      const shadowers = this.enemies
        .filter(e => e.mode === 'hunt' && !e.engaged)
        .sort((a, b) => dist(a.pos, center) - dist(b.pos, center))
      for (const s of shadowers.slice(0, HUNT_CAP - slots)) s.engaged = true
    }
    for (const e of this.enemies) {
      e.chillT = Math.max(0, e.chillT - dt)
      // rowers sprint, then blow — a sustained chase dulls the harrier's edge
      if (e.kind === 'harrier') {
        e.row = e.mode === 'hunt' ? Math.max(0, e.row - dt / 10) : Math.min(1, e.row + dt / 15)
      }
      const spd = e.speed * (e.chillT > 0 ? 0.5 : 1) * (e.kind === 'harrier' ? 0.6 + 0.4 * e.row : 1)
      const dx = center.x - e.pos.x
      const dy = center.y - e.pos.y
      const d = Math.hypot(dx, dy) || 1
      const ux = dx / d
      const uy = dy / d

      // staged aggro: raiders eye you (❓) for a beat before committing (⚔️) —
      // back out of range while they wonder and nothing happens
      if (e.mode === 'roam' && d < e.aggroR && !this.over) {
        this.notice(e)
      } else if (e.mode === 'notice') {
        e.noticeT -= dt
        // escape means opening the gap beyond where they first noticed you
        if (d > Math.max(e.aggroR, e.noticeD) + 90 || this.over) {
          e.mode = 'roam'
          this.toastAt(e.pos, 'lost interest', '#9fb8c8')
        } else if (e.noticeT <= 0) {
          this.aggro(e)
        }
      } else if (e.mode === 'hunt' && d > e.deaggroR) {
        this.breakOff(e, ux, uy, 'breaking off — patching up')
      } else if (e.mode === 'hunt') {
        // raiders are opportunists: a chase that lands nothing and costs nothing
        // isn't worth the powder. Trading shots keeps them on you; running clean
        // wears them out — that's how you flee
        e.patience -= dt
        if (e.patience <= 0) this.breakOff(e, ux, uy, 'not worth the powder')
      }

      if (e.mode === 'hunt') {
        // guns are fixed mortars with no traverse — instead of orbiting freely,
        // sail for the station where the cheapest battery's burst ring lands on you
        const gun = this.bestGun(e, center, e.engaged ?? false)
        if (gun) {
          let tx = gun.fp.x
          let ty = gun.fp.y
          // never plot a course through the player's deck: if the straight run
          // to the firing point crosses the hull, swing wide and come around
          const sx = tx - e.pos.x
          const sy = ty - e.pos.y
          const sl2 = sx * sx + sy * sy
          if (sl2 > 60 * 60) {
            const tp = clamp(((center.x - e.pos.x) * sx + (center.y - e.pos.y) * sy) / sl2, 0, 1)
            const nx = e.pos.x + sx * tp
            const ny = e.pos.y + sy * tp
            const clearance = Math.hypot(center.x - nx, center.y - ny)
            if (clearance < 160) {
              const side =
                clearance > 1
                  ? { x: (nx - center.x) / clearance, y: (ny - center.y) / clearance }
                  : { x: -uy * e.orbitDir, y: ux * e.orbitDir }
              tx = center.x + side.x * 250
              ty = center.y + side.y * 250
            }
          }
          const fx = tx - e.pos.x
          const fy = ty - e.pos.y
          const fd = Math.hypot(fx, fy) || 1
          // ease onto station rather than overshooting the firing line
          const s = Math.min(spd, fd * 1.7)
          e.vel.x = (fx / fd) * s - uy * e.orbitDir * spd * 0.1
          e.vel.y = (fy / fd) * s + ux * e.orbitDir * spd * 0.1
          // never cut across the player's deck on the way there
          if (d < 180) {
            const push = ((180 - d) / 180) * spd
            e.vel.x -= ux * push
            e.vel.y -= uy * push
          }
        } else {
          // no guns left — checkScuttle will end this ship; just close in
          e.vel.x = ux * spd
          e.vel.y = uy * spd
        }
        if (e.kind === 'raider') {
          // raiders feel the wind too, just less than your square rig — flee downwind
          const wEff = 0.8 + 0.2 * ((1 + Math.cos(angleDiff(Math.atan2(e.vel.y, e.vel.x), this.wind.a))) / 2)
          e.vel.x *= wEff
          e.vel.y *= wEff
        }
      } else if (e.mode === 'notice') {
        // turn toward you and creep closer while making up their mind
        e.vel.x = ux * spd * 0.35
        e.vel.y = uy * spd * 0.35
      } else {
        // amble on a wander heading, drifting with the wind
        e.wanderT -= dt
        if (e.wanderT <= 0) {
          e.wanderT = rand(3, 8)
          e.wanderA = rand(Math.PI * 2)
        }
        // nest ships stay tethered to their totem
        if (e.home && dist(e.pos, e.home.pos) > 470) {
          e.wanderA = Math.atan2(e.home.pos.y - e.pos.y, e.home.pos.x - e.pos.x)
        }
        e.vel.x = Math.cos(e.wanderA) * spd * 0.3 + Math.cos(this.wind.a) * this.wind.speed * 0.25
        e.vel.y = Math.sin(e.wanderA) * spd * 0.3 + Math.sin(this.wind.a) * this.wind.speed * 0.25
      }
      // becalmed pools slow sailing raiders; harriers row through
      if (e.kind === 'raider') {
        const cf = 0.55 + 0.45 * this.calmAt(e.pos)
        e.vel.x *= cf
        e.vel.y *= cf
      }
      // out of the fight, crews patch their hulls — a half-finished raid evaporates,
      // so commit and sink them or eat the loss
      if (e.mode !== 'hunt') {
        let patching = false
        if (e.burnT <= 0 && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + 6 * dt)
          patching = true
        }
        for (const g of e.guns) {
          const tp = g.plant
          if (tp.burnT <= 0 && tp.poisonT <= 0 && tp.hp < tp.maxHp) {
            tp.hp = Math.min(tp.maxHp, tp.hp + 2.5 * dt)
            patching = true
          }
        }
        if (patching && Math.random() < 1.5 * dt) this.puff(e.pos, '#b8e986', 1)
      }
      // separation from other ships
      for (const o of this.enemies) {
        if (o === e) continue
        const ox = e.pos.x - o.pos.x
        const oy = e.pos.y - o.pos.y
        const od = Math.hypot(ox, oy)
        if (od > 0 && od < 190) {
          e.vel.x += (ox / od) * 30
          e.vel.y += (oy / od) * 30
        }
      }
      e.pos.x += e.vel.x * dt
      e.pos.y += e.vel.y * dt

      // hull afire
      if (e.burnT > 0) {
        e.burnT -= dt
        e.hp -= 5 * dt
        if (Math.random() < 6 * dt) this.puff(v(e.pos.x + rand(-e.r, e.r) * 0.6, e.pos.y + rand(-e.r, e.r) * 0.6), '#ff8c42', 1)
        if (e.hp <= 0) {
          this.sinkShip(e)
          continue
        }
      }

      for (const g of [...e.guns]) {
        const p = g.plant
        if (p.burnT > 0) {
          p.burnT -= dt
          p.hp -= 3 * dt
        }
        if (p.poisonT > 0) {
          p.poisonT -= dt
          p.hp -= 2.5 * dt
        }
        if (p.hp <= 0) {
          this.killEnemyGun(e, g)
          this.checkScuttle(e)
          continue
        }
        p.cooldown -= dt
        const from = this.gunPos(e, g)
        // same mortar rules as your deck: the shell bursts at the gun's bred reach,
        // so gunners hold fire until the burst ring sits on your hull
        if (p.cooldown <= 0 && e.mode === 'hunt' && e.engaged && !this.over) {
          const drop = v(from.x + Math.cos(p.aim) * p.pheno.range, from.y + Math.sin(p.aim) * p.pheno.range)
          if (this.onHull(drop, SPLASH * 0.5)) {
            this.enemyFire(e, p, from)
            const diffMult = Math.max(0.7, 1.5 - e.danger * 0.08)
            p.cooldown = p.pheno.period * diffMult * (e.chillT > 0 ? 1.5 : 1) * rand(0.9, 1.15)
          }
        }
      }
    }
    // sunk ships go; distant roamers slip over the horizon (fresh ones respawn nearer)
    this.enemies = this.enemies.filter(
      e => !e.sunk && (e.mode === 'hunt' || dist(e.pos, center) < (e.home ? 2600 : 1700))
    )
    // a nest whose pod drifted out of the world re-arms for the next visit
    for (const p of this.activePois) {
      if (p.kind === 'nest' && p.nestUp && !p.done && !this.enemies.some(e => e.home === p)) p.nestUp = false
    }
  }

  /** give up the chase and wander off to lick wounds — the way out of a hunt */
  private breakOff(e: EnemyShip, ux: number, uy: number, msg: string) {
    e.mode = 'roam'
    e.engaged = false
    e.deaggroR = e.kind === 'harrier' ? 820 : DEAGGRO_R // shed any pod-wake stretch
    e.wanderT = rand(3, 8)
    e.wanderA = Math.atan2(-uy, -ux) // sail off, unhurried, patching up
    this.toastAt(e.pos, msg, '#9fb8c8')
  }

  /** the gun whose firing station costs the least sailing — fixed mortars can't
   *  traverse, so the ship picks the battery whose burst ring is cheapest to walk
   *  onto you: engaged hunters station at that gun's bred reach (a spyglass line
   *  is a proper artillery ship), shadowers hold off at 430 */
  private bestGun(e: EnemyShip, center: Vec, engaged: boolean): { p: Plant; fp: Vec } | null {
    let best: { p: Plant; fp: Vec; d: number } | null = null
    for (const g of e.guns) {
      const p = g.plant
      const standoff = engaged ? p.pheno.range : 430
      const fp = v(center.x - Math.cos(p.aim) * standoff - g.x, center.y - Math.sin(p.aim) * standoff - g.y)
      const d = dist(e.pos, fp)
      if (!best || d < best.d) best = { p, fp, d }
    }
    return best
  }

  private enemyFire(e: EnemyShip, p: Plant, from: Vec) {
    const speed = 200 // slower shells than yours — keep way on and slip the drop
    // fixed mounts lob dead along their heading, bursting at the gun's bred reach —
    // no leading, no homing: read the red rings and don't be there when it lands
    const a = p.aim + rand(-0.05, 0.05)
    const drop = v(from.x + Math.cos(a) * p.pheno.range + rand(-8, 8), from.y + Math.sin(a) * p.pheno.range + rand(-8, 8))
    const pos = v(from.x, from.y - 16)
    const flightT = dist(from, drop) / speed
    this.bullets.push({
      pos,
      vel: v((drop.x - pos.x) / flightT, (drop.y - pos.y) / flightT),
      dmg: p.pheno.dmg * (0.75 + e.danger * 0.06),
      element: p.pheno.element,
      quirk: 'none',
      friendly: false,
      life: flightT,
      drop,
      flightT,
      splash: SPLASH,
      owner: e,
    })
  }

  private damageEnemyHull(e: EnemyShip, b: Bullet) {
    e.hp -= b.dmg
    if (b.element === 'ember') e.burnT = 3
    if (b.element === 'frost') e.chillT = 2.5
    if (e.hp <= 0) this.sinkShip(e)
  }

  private sinkShip(e: EnemyShip) {
    if (e.sunk) return
    e.sunk = true
    // guns go down with the ship — their seed lines may float free
    for (const g of [...e.guns]) this.killEnemyGun(e, g)
    const scatter = () => v(e.pos.x + rand(-e.r, e.r), e.pos.y + rand(-e.r, e.r))
    // loot scales a touch faster than the threat — pushing one ring out is always tempting
    let wood = e.size * randInt(2, 3) + Math.floor(e.danger * 0.8)
    while (wood > 0) {
      const n = Math.min(wood, randInt(2, 4))
      this.dropLoot('wood', n, scatter())
      wood -= n
    }
    this.dropLoot('water', 2 + Math.floor(e.danger / 2), scatter())
    this.stats.sunk++
    this.shake = Math.min(10, this.shake + 5)
    this.burst(e.pos, '#8a6a45', 16)
    this.toastAt(e.pos, '☠ ship sunk!', '#ffd257')
    sfx('sunk')
    if (e.home && !this.enemies.some(o => o !== e && o.home === e.home && !o.sunk)) {
      this.nestCleared(e.home)
    }
  }

  /** a ship with no guns left has no fight left — the crew scuttles it */
  private checkScuttle(e: EnemyShip) {
    if (e.scuttling || e.sunk || e.guns.length > 0) return
    e.scuttling = true
    this.toastAt(e.pos, 'defenseless — crew scuttles!', '#ffd257')
    this.sinkShip(e)
  }

  private killEnemyGun(e: EnemyShip, g: EGun) {
    const i = e.guns.indexOf(g)
    if (i < 0) return
    e.guns.splice(i, 1)
    const pos = this.gunPos(e, g)
    this.burst(pos, '#4e9a5f', 8)
    // your own bees keep the pouch fed — only a line worth stealing floats free,
    // and deeper waters carry hotter genomes, so range is still the gene hunt
    if (carriesRare(g.plant.genome) && Math.random() < 0.5) {
      this.dropLoot('seed', 1, pos, { id: this.seedId++, genome: g.plant.genome, gen: 0 })
      this.toastAt(pos, '🌰 rare line adrift!', '#b8e986')
    } else if (Math.random() < 0.12) {
      this.dropLoot('wood', 1, pos)
    }
  }

  // ---- bullets ----

  private updateBullets(dt: number) {
    const dead = new Set<Bullet>()
    for (const b of this.bullets) {
      // homing: steer a friendly shell toward the nearest raider in flight,
      // and let it burst the moment it reaches one
      if (b.homing && b.friendly && this.enemies.length) {
        let best: EnemyShip | null = null
        let bd = Infinity
        for (const e of this.enemies) {
          if (e.sunk) continue
          const d = dist(b.pos, e.pos)
          if (d < bd) {
            bd = d
            best = e
          }
        }
        if (best) {
          const speed = Math.hypot(b.vel.x, b.vel.y) || 1
          const cur = Math.atan2(b.vel.y, b.vel.x)
          const want = Math.atan2(best.pos.y - b.pos.y, best.pos.x - b.pos.x)
          const na = cur + clamp(angleDiff(want, cur), -3.2 * dt, 3.2 * dt)
          b.vel.x = Math.cos(na) * speed
          b.vel.y = Math.sin(na) * speed
          b.drop = v(b.pos.x + b.vel.x * b.life, b.pos.y + b.vel.y * b.life)
          if (bd < best.r + 14) b.life = 0
        }
      }
      b.life -= dt
      if (b.life <= 0) {
        this.shellBurst(b)
        dead.add(b)
        continue
      }
      b.pos.x += b.vel.x * dt
      b.pos.y += b.vel.y * dt
    }
    this.bullets = this.bullets.filter(b => !dead.has(b))
  }

  /** a shell comes down: splash damage to every hull and gun near the drop point */
  private shellBurst(b: Bullet) {
    const at = b.drop
    const splash = b.splash
    let hitAny = false
    if (!b.friendly) {
      // a raider shell over your deck — plants catch the shrapnel, the hull the blast
      for (const m of this.mounts) {
        const p = m.plant
        if (!p) continue
        if (dist(at, this.mountPos(m)) < splash) {
          hitAny = true
          if (b.owner && !b.owner.sunk) b.owner.patience = CHASE_PATIENCE // a burst that tells keeps them keen
          p.hp -= b.dmg * (b.element === 'venom' ? 1.6 : 1)
          if (b.element === 'ember') p.burnT = 3
          if (b.element === 'frost') this.chillT = 2.5
          if (b.element === 'venom') p.poisonT = 4
        }
      }
      if (this.onHull(at, splash * 0.5)) {
        hitAny = true
        if (b.owner && !b.owner.sunk) b.owner.patience = CHASE_PATIENCE // a burst that tells keeps them keen
        this.ship.hp -= b.dmg
        if (b.element === 'ember') this.burnT = 3
        if (b.element === 'frost') this.chillT = 2.5
        this.shake = Math.min(8, this.shake + 1.5)
        if (this.ship.hp <= 0) this.gameOver()
      }
      if (hitAny) {
        this.burst(at, this.bulletColor(b), 10)
        sfx('hit')
      } else {
        this.puff(at, '#bfe3f2', 5)
      }
      return
    }
    for (const e of this.enemies) {
      if (e.sunk) continue
      for (const g of [...e.guns]) {
        const p = g.plant
        if (dist(at, this.gunPos(e, g)) < splash) {
          hitAny = true
          this.aggro(e)
          e.patience = CHASE_PATIENCE // you drew blood — now they're invested
          p.hp -= b.dmg * (b.element === 'venom' ? 1.6 : 1)
          if (b.element === 'ember') p.burnT = 3
          if (b.element === 'frost') e.chillT = 2.5
          if (b.element === 'venom') p.poisonT = 4
          if (b.quirk === 'leech' && b.src) b.src.water = Math.min(100, b.src.water + 2)
          if (p.hp <= 0) {
            this.killEnemyGun(e, g)
            this.checkScuttle(e)
          }
        }
      }
      if (!e.sunk && dist(at, e.pos) < e.r + splash * 0.5) {
        hitAny = true
        this.aggro(e)
        e.patience = CHASE_PATIENCE // you drew blood — now they're invested
        this.damageEnemyHull(e, b)
        if (b.quirk === 'leech' && b.src) b.src.water = Math.min(100, b.src.water + 2)
      }
    }
    if (hitAny) {
      this.burst(at, this.bulletColor(b), 10)
      this.shake = Math.min(8, this.shake + 1)
      sfx('hit')
    } else {
      // a clean miss reads as a sea plume — the feedback that tunes your next volley
      this.puff(at, '#bfe3f2', 5)
    }
    // airburst trigger: cast the rest of the stack from this burst point
    if (b.payload && b.src) {
      const p = b.src
      const base = { range: p.pheno.range, dmg: p.pheno.dmg, splash: SPLASH, element: p.pheno.element, speed: 240 }
      for (const shot of b.payload) this.spawnShot(shot, at, b.heading ?? 0, base, b.friendly, p, false)
      this.puff(at, '#ffe08a', 6)
    }
  }

  bulletColor(b: Bullet): string {
    switch (b.element) {
      case 'ember':
        return '#ff7a45'
      case 'frost':
        return '#7fd8ff'
      case 'venom':
        return '#b07fff'
      default:
        return b.friendly ? '#ffd257' : '#ff9d9d'
    }
  }

  private gameOver() {
    if (this.over) return
    this.over = true
    this.burst(this.ship.pos, '#8a6a45', 24)
    this.shake = Math.min(14, this.shake + 8)
    sfx('over')
  }

  // ---- loot ----

  dropLoot(kind: LootKind, n: number, pos: Vec, seed?: Seed) {
    this.loot.push({
      kind,
      n,
      seed,
      pos: v(pos.x, pos.y),
      vel: v(rand(-15, 15), rand(-15, 15)),
      ttl: 70,
      phase: rand(Math.PI * 2),
    })
  }

  spawnAmbientLoot() {
    // flotsam rides the wind past your ship — set an intercept course or let it go
    const c = this.ship.pos
    const angle = this.wind.a + Math.PI + rand(-1.3, 1.3) // upwind side, so it drifts through
    const d = rand(380, 640)
    const pos = v(c.x + Math.cos(angle) * d, c.y + Math.sin(angle) * d)
    const drift = rand(0.22, 0.4)
    const vel = v(
      Math.cos(this.wind.a) * this.wind.speed * drift + rand(-5, 5),
      Math.sin(this.wind.a) * this.wind.speed * drift + rand(-5, 5)
    )
    // flotsam is materials only — seeds come from your bees or somebody's garden
    const loot: Loot =
      Math.random() < 0.6
        ? { kind: 'wood', n: randInt(2, 3), seed: undefined, pos, vel, ttl: 70, phase: rand(6) }
        : { kind: 'water', n: 2, seed: undefined, pos, vel, ttl: 70, phase: rand(6) }
    this.loot.push(loot)
  }

  private updateLoot(dt: number) {
    const center = this.ship.pos
    const magnet = this.magnetActive()
    const taken = new Set<Loot>()
    for (const l of this.loot) {
      l.phase += dt
      l.ttl -= dt
      if (l.ttl <= 0) {
        taken.add(l)
        continue
      }
      const pulled = magnet && dist(l.pos, center) < 190
      if (pulled) {
        const d = dist(l.pos, center)
        if (d > 1) {
          l.vel.x += ((center.x - l.pos.x) / d) * 90 * dt
          l.vel.y += ((center.y - l.pos.y) / d) * 90 * dt
        }
      } else {
        // everything afloat settles into the wind current (dead water in becalmed pools)
        const k = Math.min(1, 0.5 * dt)
        const cur = this.wind.speed * 0.3 * this.calmAt(l.pos)
        l.vel.x += (Math.cos(this.wind.a) * cur - l.vel.x) * k
        l.vel.y += (Math.sin(this.wind.a) * cur - l.vel.y) * k
      }
      l.pos.x += l.vel.x * dt
      l.pos.y += l.vel.y * dt
      if (this.onHull(l.pos, 18)) {
        this.collect(l)
        taken.add(l)
      }
    }
    this.loot = this.loot.filter(l => !taken.has(l))
  }

  private collect(l: Loot) {
    switch (l.kind) {
      case 'wood':
        this.wood += l.n
        this.toastAt(l.pos, `+${l.n}🪵`, '#e8c98a')
        break
      case 'water':
        this.water += l.n
        this.toastAt(l.pos, `+${l.n}💧`, '#7fd8ff')
        break
      case 'seed':
        if (l.seed) {
          this.seeds.push(l.seed)
          this.toastAt(l.pos, `🌰 ${phenotype(l.seed.genome).name}`, '#b8e986')
        }
        break
    }
    sfx('collect')
  }

  // ---- open sea ----

  private updateSea(dt: number) {
    this.ambientT -= dt
    if (this.ambientT <= 0) {
      this.ambientT = 5.5
      this.spawnAmbientLoot()
    }
    // keep the surrounding waters populated with roaming raiders — but a fleet
    // already hunting you doesn't get reinforcements out of thin air, so a
    // flight doesn't conjure fresh pursuers ahead of your bow
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      this.spawnT = 4
      const hunting = this.enemies.filter(e => e.mode === 'hunt').length
      const danger = this.dangerAt(this.ship.pos)
      const cap = Math.min(8, 3 + Math.floor(danger / 2))
      if (hunting < 2 && this.enemies.length < cap) {
        if (danger > 1.6 && Math.random() < 0.22) this.spawnPod()
        else this.spawnEnemyShip()
      }
    }
  }

  // ---- input / actions ----

  pointerMove(mx: number, my: number) {
    this.hoverScreen = v(mx, my)
    this.hover = this.screenToWorld(mx, my)
  }

  private updateHoverInfo() {
    this.hoverInfo = null
    for (const m of this.mounts) {
      if (!m.plant) continue
      const tp = this.mountPos(m)
      if (dist(this.hover, v(tp.x, tp.y - 12)) < 20) {
        this.hoverInfo = { plant: m.plant, hostile: false, pos: tp }
        return
      }
    }
    for (const e of this.enemies) {
      for (const g of e.guns) {
        const tp = this.gunPos(e, g)
        if (dist(this.hover, v(tp.x, tp.y - 12)) < 20) {
          this.hoverInfo = { plant: g.plant, hostile: true, pos: tp }
          return
        }
      }
    }
  }

  click(mx: number, my: number) {
    if (this.over) {
      if (inRect(mx, my, restartRect(this.vw, this.vh))) this.reset()
      return
    }
    if (this.helpOpen) {
      this.helpOpen = false
      return
    }
    for (const r of toolbarLayout(this.vw, this.vh)) {
      if (inRect(mx, my, r)) {
        this.tool = r.tool
        return
      }
    }
    if (this.tool === 'plant' && this.seeds.length) {
      const panel = seedPanelRect(this.vw)
      if (inRect(mx, my, panel)) {
        for (const row of seedRowRects(this.vw, this.seeds.length, this.seedScroll)) {
          if (inRect(mx, my, row)) {
            this.seedSel = row.idx
            return
          }
        }
        return
      }
    }
    if (this.tool === 'rig') {
      const panel = compPanelRect(this.vw, PALETTE.length)
      if (inRect(mx, my, panel)) {
        for (const row of compRowRects(this.vw, PALETTE.length)) {
          if (inRect(mx, my, row)) {
            this.compSel = row.idx
            return
          }
        }
        return
      }
    }
    if (this.paused) return
    this.worldClick(this.screenToWorld(mx, my))
  }

  wheel(dir: number) {
    if (this.tool === 'plant') {
      this.seedScroll = clamp(this.seedScroll + dir, 0, Math.max(0, this.seeds.length - SEED_VISIBLE))
    } else if (this.tool === 'rig') {
      this.compSel = (this.compSel + dir + PALETTE.length) % PALETTE.length
    }
  }

  keydown(code: string) {
    const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(code)
    if (idx >= 0 && idx < TOOLS.length) {
      this.tool = TOOLS[idx].tool
      return
    }
    switch (code) {
      case 'KeyQ':
        if (this.tool === 'rig') this.compSel = (this.compSel + PALETTE.length - 1) % PALETTE.length
        else if (this.seeds.length) this.seedSel = (this.seedSel + this.seeds.length - 1) % this.seeds.length
        break
      case 'KeyE':
        if (this.tool === 'rig') this.compSel = (this.compSel + 1) % PALETTE.length
        else if (this.seeds.length) this.seedSel = (this.seedSel + 1) % this.seeds.length
        break
      case 'KeyT':
        if (!this.over && !this.paused && !this.helpOpen) this.tryTrade()
        break
      case 'KeyB':
        this.boil()
        break
      case 'KeyU':
        this.upgradeHull()
        break
      case 'Space':
        // pull the lanyard: fire every loaded gun that bears next frame
        if (!this.over && !this.paused && !this.helpOpen) this.firing = true
        break
      case 'KeyH':
        this.helpOpen = !this.helpOpen
        break
      case 'KeyP':
        if (!this.over) this.paused = !this.paused
        break
      case 'KeyM':
        toggleMute()
        break
      case 'KeyR':
        if (this.over) this.reset()
        break
    }
  }

  private toast(text: string) {
    this.toastAt(this.hover, text, '#ffb3b3')
    sfx('deny')
  }

  toastAt(pos: Vec, text: string, color: string) {
    this.texts.push({ pos: v(pos.x, pos.y - 20), text, life: 1.6, color })
  }

  /** the mount under a world point, if any */
  private mountAt(w: Vec): number | null {
    let best: number | null = null
    let bd = 30
    for (let i = 0; i < this.mounts.length; i++) {
      const d = dist(w, this.mountPos(this.mounts[i]))
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return best
  }

  private worldClick(w: Vec) {
    const mi = this.mountAt(w)
    const m = mi === null ? null : this.mounts[mi]

    switch (this.tool) {
      case 'plant': {
        if (!m) return
        if (m.plant) {
          // occupied — dig it up to make room for a better cultivar
          m.plant = null
          this.toastAt(this.mountPos(m), 'dug up 🥀', '#c5b8a0')
          return
        }
        if (!this.seeds.length) return this.toast('no seeds — breed or loot')
        const seed = this.seeds.splice(this.seedSel, 1)[0]
        this.seedSel = clamp(this.seedSel, 0, Math.max(0, this.seeds.length - 1))
        this.seedScroll = clamp(this.seedScroll, 0, Math.max(0, this.seeds.length - SEED_VISIBLE))
        const plant = makePlant(seed.genome, seed.gen)
        plant.aim = m.aim0 // sown facing the mount's natural bearing
        m.plant = plant
        this.toastAt(this.mountPos(m), `🌱 ${phenotype(seed.genome).name}`, '#b8e986')
        sfx('build')
        break
      }

      case 'rig': {
        if (!m) return
        const comp = PALETTE[this.compSel]
        if (comp.id === CLEAR.id) {
          if (!m.components.length) return
          m.components = []
          this.toastAt(this.mountPos(m), 'stripped 🔧', '#c5b8a0')
          sfx('build')
          return
        }
        if (m.components.length >= MAX_SLOTS) return this.toast(`mount is full (${MAX_SLOTS} slots) — ✕ to strip`)
        m.components = [...m.components, comp]
        this.toastAt(this.mountPos(m), buildLabel(m.components), '#b8e986')
        sfx('build')
        break
      }

      case 'water': {
        const p = m?.plant
        if (!m || !p) return
        if (this.water < 1) return this.toast('no fresh water — B boils 1🪵 → 2💧')
        if (p.water >= 100) return this.toast('already soaked')
        this.water--
        p.water = Math.min(100, p.water + WATER_PER_USE)
        p.dryTime = 0
        this.puff(v(this.mountPos(m).x, this.mountPos(m).y - 14), '#7fd8ff', 5)
        sfx('water')
        break
      }
    }
  }

  // ---- fx helpers ----

  puff(pos: Vec, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        pos: v(pos.x + rand(-4, 4), pos.y + rand(-4, 4)),
        vel: v(rand(-30, 30), rand(-40, 5)),
        life: rand(0.3, 0.7),
        maxLife: 0.7,
        size: rand(1.5, 3.5),
        color,
      })
    }
  }

  burst(pos: Vec, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2)
      const sp = rand(30, 110)
      this.particles.push({
        pos: v(pos.x, pos.y),
        vel: v(Math.cos(a) * sp, Math.sin(a) * sp),
        life: rand(0.4, 0.9),
        maxLife: 0.9,
        size: rand(2, 4.5),
        color,
      })
    }
  }
}
