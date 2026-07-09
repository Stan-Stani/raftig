import { Vec, v, dist, clamp, rand, randInt, pick, gkey, angleDiff } from './util'
import { Genome, Seed, Pheno, phenotype, wildGenome, breed, makeGenome } from './genetics'
import { Tool, TOOLS, toolbarLayout, seedRowRects, seedPanelRect, restartRect, inRect } from './ui'
import { POI, POI_CELL, POI_SIGHT, cellPOI, makePOI, TRADE_COST, TRADE_RANGE } from './poi'
import { keys } from './input'
import { sfx, toggleMute } from './audio'

export const TS = 46 // tile size, px
export const RANGE = 280 // plant firing range
export const TILE_HP = 60
export const PLANT_HP = 40
export const GROW_TIME = 28 // seconds to mature (while watered)
export const WATER_PER_USE = 45 // meter points per 1💧
export const BREED_COST = 2 // 💧
export const BREED_CD = 18
export const BUILD_COST = 5 // 🪵
export const BOILER_COST = 6 // 🪵
export const FUEL_TIME = 10 // seconds to burn 1🪵
export const FUEL_WATER = 2 // 💧 per 🪵 burned
export const FUEL_CAP = 4
export const WIND_MIN = 16 // px/s
export const WIND_MAX = 60
export const AGGRO_R = 330 // raiders notice you inside this range…
export const DEAGGRO_R = 590 // …and give up the chase beyond this
export const NOTICE_T = 1.0 // seconds of ❓ before a raider commits
export const POD_WAKE_R = 340 // committing raiders stir roaming neighbours this close
export const GUN_ARC = 0.45 // radians — raider gunners hold fire until the target bears
export const DANGER_SCALE = 550 // px from home waters per +1 danger
export const FOG_CELL = 280 // minimap fog-of-war resolution
export const FOG_SIGHT = 640 // radius revealed around the raft

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
  breedCd: number
  dryTime: number
  burnT: number
  poisonT: number
  wobble: number // render phase
  aim: number // fixed firing heading, radians; yours via the 🎯 tool, raiders' set at launch
}

export interface PotStructure {
  kind: 'pot'
  plant: Plant | null
}
export interface BoilerStructure {
  kind: 'boiler'
  fuel: number
  progress: number
}
export type Structure = PotStructure | BoilerStructure

export interface Tile {
  gx: number
  gy: number
  hp: number
  structure: Structure | null
  burnT: number
}

export interface ETile {
  gx: number
  gy: number
  hp: number
  maxHp: number
  plant: Plant | null
  burnT: number
}

export interface EnemyRaft {
  pos: Vec
  vel: Vec
  tiles: ETile[]
  chillT: number
  orbitDir: number
  speed: number
  /** roam → notice (❓, turning toward you) → hunt (⚔️, committed) */
  mode: 'roam' | 'notice' | 'hunt'
  noticeT: number
  /** distance to the player when it noticed — pod-woken rafts come look from afar */
  noticeD: number
  aggroR: number
  deaggroR: number
  wanderA: number
  wanderT: number
  danger: number // difficulty of the waters it spawned in
  /** harriers row — fast in any wind, but small and fragile */
  kind: 'raider' | 'harrier'
  /** raft belongs to a nest and stays tethered to it */
  home?: POI
  /** mid-scuttle guard — the hull is being torn down, don't re-enter */
  scuttling?: boolean
}

export interface Wind {
  a: number // blowing toward this angle
  speed: number
  targetA: number
  targetSpeed: number
  shiftT: number
}

export interface Bullet {
  pos: Vec
  vel: Vec
  speed: number
  dmg: number
  element: Pheno['element']
  quirk: Pheno['quirk']
  friendly: boolean
  life: number
  pierceLeft: number
  hitSet: Set<unknown>
  tEnemy?: EnemyRaft
  tTile?: ETile
  src?: Plant
}

export type LootKind = 'wood' | 'pot' | 'soil' | 'seed' | 'water'
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
    breedCd: 0,
    dryTime: 0,
    burnT: 0,
    poisonT: 0,
    wobble: rand(Math.PI * 2),
    aim: -Math.PI / 2, // default: straight up; re-point with the 🎯 tool
  }
}

export class Game {
  vw = 800
  vh = 600
  time = 0

  raft = { pos: v(0, 0), vel: v(0, 0) }
  tiles = new Map<string, Tile>()

  wood = 0
  water = 0
  pots = 0
  soil = 0
  seeds: Seed[] = []
  seedId = 1

  enemies: EnemyRaft[] = []
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
  /** fog-of-war: minimap cells the raft has sailed near */
  seen = new Set<string>()
  fogT = 0

  tool: Tool = 'water'
  seedSel = 0
  seedScroll = 0
  breedFirst: string | null = null
  aimFirst: string | null = null // plant awaiting a heading click (🎯 tool)

  chillT = 0 // frost debuff on our raft
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
    this.raft = { pos: v(0, 0), vel: v(0, 0) }
    this.tiles = new Map()
    for (let gx = -1; gx <= 1; gx++) {
      for (let gy = -1; gy <= 1; gy++) {
        this.tiles.set(gkey(gx, gy), { gx, gy, hp: TILE_HP, structure: null, burnT: 0 })
      }
    }
    // two pots to start; one holds a half-grown basic shooter so wave 1 is survivable
    const potA = this.tiles.get(gkey(0, 0))!
    const potB = this.tiles.get(gkey(1, 0))!
    potA.structure = { kind: 'pot', plant: makePlant(makeGenome(), 0, 0.55) }
    potB.structure = { kind: 'pot', plant: null }

    this.wood = 8
    this.water = 6
    this.pots = 1
    this.soil = 2
    this.seedId = 1
    // starter seeds: heterozygous lines that reward crossing (stout × brisk/twin,
    // with ember and hardy hiding in the pairs)
    this.seeds = [
      { id: this.seedId++, gen: 0, genome: makeGenome({ power: ['mild', 'stout'], element: ['plain', 'ember'] }) },
      { id: this.seedId++, gen: 0, genome: makeGenome({ rate: ['lazy', 'brisk'], barrel: ['single', 'twin'], thirst: ['thirsty', 'hardy'] }) },
    ]

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
    this.breedFirst = null
    this.aimFirst = null
    this.chillT = 0
    this.shake = 0
    this.over = false
    this.paused = false
    this.helpOpen = false
    this.stats = { sunk: 0, bred: 0, time: 0, far: 0 }
    this.banner = { title: 'raftig', sub: 'hoist the sail — raiders roam these waters', t: 4 }
    for (let i = 0; i < 3; i++) this.spawnEnemyRaft()
  }

  resize(w: number, h: number) {
    this.vw = w
    this.vh = h
  }

  // ---- coordinates ----

  tilePos(t: { gx: number; gy: number }): Vec {
    return v(this.raft.pos.x + t.gx * TS, this.raft.pos.y + t.gy * TS)
  }

  etilePos(e: EnemyRaft, t: ETile): Vec {
    return v(e.pos.x + t.gx * TS, e.pos.y + t.gy * TS)
  }

  raftCenter(): Vec {
    if (this.tiles.size === 0) return this.raft.pos
    let x = 0
    let y = 0
    for (const t of this.tiles.values()) {
      x += t.gx
      y += t.gy
    }
    const n = this.tiles.size
    return v(this.raft.pos.x + (x / n) * TS, this.raft.pos.y + (y / n) * TS)
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
    for (const t of this.tiles.values()) {
      const p = t.structure?.kind === 'pot' ? t.structure.plant : null
      if (p && p.growth >= 1 && p.water > 0 && p.pheno.quirk === 'magnet') return true
    }
    return false
  }

  // ---- update ----

  update(dt: number) {
    this.cam = this.raftCenter()
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
    this.updateRaft(dt)
    this.updateEnemies(dt)
    this.updateBullets(dt)
    this.updateLoot(dt)
    this.updateSea(dt)
    this.updateHoverInfo()
    this.updateFx(dt)
    this.stats.far = Math.max(this.stats.far, dist(this.raftCenter(), v(0, 0)))
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
    const c = this.raftCenter()
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

    // fog of war: reveal the waters around the raft
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
    this.dropLoot('water', 2 + Math.floor(danger / 2), scatter())
    if (Math.random() < 0.7) this.dropLoot('pot', 1, scatter())
    else this.dropLoot('soil', 1, scatter())
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
      this.spawnEnemyRaft({ at, home: p, dangerBonus: 2 })
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
      if (roll < 0.4) this.dropLoot('wood', randInt(2, 3), at)
      else if (roll < 0.6) this.dropLoot('water', 2, at)
      else if (roll < 0.75) this.dropLoot(Math.random() < 0.5 ? 'pot' : 'soil', 1, at)
      else this.dropLoot('seed', 1, at, { id: this.seedId++, genome: wildGenome(1 + danger * 0.4), gen: 0 })
    }
    for (const l of this.loot.slice(-n)) {
      l.ttl = 999
      l.vel = v(0, 0)
    }
  }

  /** barter with a trader raft in range (T) — wood for good seed lines */
  tryTrade() {
    const c = this.raftCenter()
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
    let ax = 0
    let ay = 0
    if (keys.has('KeyW') || keys.has('ArrowUp')) ay -= 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) ay += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1
    this.sailEff = null
    if (ax || ay) {
      // sail physics: full speed running with the wind, a crawl beating into it —
      // tack across the wind (or wait for it to shift) instead of fighting it head-on
      const heading = Math.atan2(ay, ax)
      const eff = 0.3 + 0.7 * Math.pow((1 + Math.cos(angleDiff(heading, this.wind.a))) / 2, 1.5)
      // becalmed pools starve the sail — rowing raiders don't care
      const calm = this.calmAt(this.raft.pos)
      const gust = (0.5 + 0.5 * (this.wind.speed * calm / WIND_MAX)) * (0.45 + 0.55 * calm)
      this.sailEff = eff
      const maxSpeed = 120 * eff * gust * (this.chillT > 0 ? 0.55 : 1)
      this.raft.vel.x += Math.cos(heading) * 260 * eff * gust * dt
      this.raft.vel.y += Math.sin(heading) * 260 * eff * gust * dt
      const sp = Math.hypot(this.raft.vel.x, this.raft.vel.y)
      if (sp > maxSpeed) {
        this.raft.vel.x *= maxSpeed / sp
        this.raft.vel.y *= maxSpeed / sp
      }
    }
    this.raft.vel.x *= 1 - Math.min(1, 1.4 * dt)
    this.raft.vel.y *= 1 - Math.min(1, 1.4 * dt)
    this.raft.pos.x += this.raft.vel.x * dt
    this.raft.pos.y += this.raft.vel.y * dt
  }

  private updateRaft(dt: number) {
    for (const tile of this.tiles.values()) {
      // burning planks
      if (tile.burnT > 0) {
        tile.burnT -= dt
        tile.hp -= 4 * dt
        if (Math.random() < 6 * dt) this.puff(this.tilePos(tile), '#ff8c42', 1)
        if (tile.hp <= 0) {
          this.destroyPlayerTile(tile)
          continue
        }
      }

      const s = tile.structure
      if (!s) continue

      if (s.kind === 'boiler') {
        if (s.fuel > 0) {
          s.progress += dt
          if (Math.random() < 3 * dt) this.puff(v(this.tilePos(tile).x, this.tilePos(tile).y - 14), '#cfd8dc', 1)
          if (s.progress >= FUEL_TIME) {
            s.progress = 0
            s.fuel--
            this.water += FUEL_WATER
            this.toastAt(this.tilePos(tile), `+${FUEL_WATER}💧`, '#7fd8ff')
          }
        }
        continue
      }

      const p = s.plant
      if (!p) continue

      // growth & thirst — plants gulp in battle, only sip at rest
      if (p.water > 0) {
        p.growth = Math.min(1, p.growth + dt / GROW_TIME)
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
      if (p.hp <= 0) {
        s.plant = null
        this.toastAt(this.tilePos(tile), '🥀', '#c5b8a0')
        if (this.breedFirst === gkey(tile.gx, tile.gy)) this.breedFirst = null
        continue
      }

      p.cooldown -= dt
      p.breedCd = Math.max(0, p.breedCd - dt)

      // firing — plants shoot along a fixed heading set by the player, engaging
      // whenever a raider drifts into range but never tracking it.
      if (p.growth >= 1 && p.water > 0 && p.cooldown <= 0) {
        const from = this.tilePos(tile)
        if (this.enemyInRange(from)) {
          this.firePlant(p, from)
          p.cooldown = p.pheno.period * (this.chillT > 0 ? 1.35 : 1)
          p.water = Math.max(0, p.water - 0.35)
        }
      }
    }
    if (this.tiles.size === 0 && !this.over) this.gameOver()
  }

  /** true if any enemy tile sits within firing range of the given point */
  private enemyInRange(from: Vec): boolean {
    for (const e of this.enemies) {
      for (const t of e.tiles) {
        if (dist(from, this.etilePos(e, t)) < RANGE) return true
      }
    }
    return false
  }

  /** true while a raider sits within any plant's firing range — locks re-aiming */
  private inCombat(): boolean {
    for (const t of this.tiles.values()) {
      if (this.enemyInRange(this.tilePos(t))) return true
    }
    return false
  }

  private firePlant(p: Plant, from: Vec) {
    p.activeT = 4
    const spread = 0.14 // radians between barrels of a multi-shot plant
    const speed = 330
    for (let i = 0; i < p.pheno.shots; i++) {
      const a = p.aim + (i - (p.pheno.shots - 1) / 2) * spread
      this.bullets.push({
        pos: v(from.x + rand(-4, 4), from.y - 16 + rand(-3, 3)),
        vel: v(Math.cos(a) * speed, Math.sin(a) * speed),
        speed,
        dmg: p.pheno.dmg,
        element: p.pheno.element,
        quirk: p.pheno.quirk,
        friendly: true,
        life: 4,
        pierceLeft: p.pheno.quirk === 'pierce' ? 2 : 0,
        hitSet: new Set(),
        src: p,
      })
    }
    this.puff(v(from.x, from.y - 16), '#fff3c4', 2)
    if (Math.random() < 0.7) sfx('shoot')
  }

  // ---- enemies ----

  spawnEnemyRaft(opts: { at?: Vec; kind?: EnemyRaft['kind']; home?: POI; dangerBonus?: number } = {}) {
    const c = this.raftCenter()
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
    const cells: { gx: number; gy: number }[] = [{ gx: 0, gy: 0 }]
    while (cells.length < size) {
      const base = pick(cells)
      const dir = pick([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
      const gx = base.gx + dir[0]
      const gy = base.gy + dir[1]
      if (!cells.some(cl => cl.gx === gx && cl.gy === gy)) cells.push({ gx, gy })
    }
    const maxHp = kind === 'harrier' ? 22 + danger * 5 : 30 + danger * 7
    const tiles: ETile[] = cells.map(cl => ({ ...cl, hp: maxHp, maxHp, plant: null, burnT: 0 }))
    let plantCount =
      kind === 'harrier' ? 1 : 1 + (size >= 4 ? 1 : 0) + (danger >= 6 && size >= 5 ? 1 : 0) + (opts.home ? 1 : 0)
    const shuffled = [...tiles].sort(() => Math.random() - 0.5)
    for (const t of shuffled) {
      if (plantCount-- <= 0) break
      t.plant = makePlant(wildGenome((opts.home ? 1.6 : 1) + danger * 0.4), 0, 1)
      t.plant.water = 100
    }
    // guns are bolted to the hull, ship-cannon style: batteries share an axis and
    // alternate port/starboard — the raft has to maneuver to bring one to bear
    const gunA = rand(Math.PI * 2)
    let battery = 0
    for (const t of tiles) {
      if (t.plant) t.plant.aim = gunA + (battery++ % 2) * Math.PI + rand(-0.15, 0.15)
    }
    this.enemies.push({
      pos,
      vel: v(0, 0),
      tiles,
      chillT: 0,
      orbitDir: Math.random() < 0.5 ? 1 : -1,
      speed: kind === 'harrier' ? 92 + Math.min(18, danger * 2.5) : Math.min(80, 40 + danger * 3 + rand(10)),
      mode: 'roam',
      noticeT: 0,
      noticeD: 0,
      aggroR: kind === 'harrier' ? 380 : AGGRO_R,
      deaggroR: kind === 'harrier' ? 820 : DEAGGRO_R,
      wanderA: rand(Math.PI * 2),
      wanderT: rand(2, 6),
      danger,
      kind,
      home: opts.home,
    })
  }

  /** some sails travel in pods — waking one means waking the neighbourhood */
  private spawnPod() {
    const c = this.raftCenter()
    const angle = rand(Math.PI * 2)
    const away = rand(700, 1050)
    const anchor = v(c.x + Math.cos(angle) * away, c.y + Math.sin(angle) * away)
    const n = randInt(2, 3)
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2)
      this.spawnEnemyRaft({ at: v(anchor.x + Math.cos(a) * rand(90, 180), anchor.y + Math.sin(a) * rand(90, 180)) })
    }
  }

  private notice(e: EnemyRaft, t = NOTICE_T) {
    if (e.mode !== 'roam') return
    e.mode = 'notice'
    e.noticeT = e.kind === 'harrier' ? t * 0.6 : t
    e.noticeD = dist(e.pos, this.raftCenter())
    this.toastAt(e.pos, '❓', '#ffd257')
    sfx('notice')
  }

  aggro(e: EnemyRaft) {
    if (e.mode === 'hunt') return
    e.mode = 'hunt'
    // committing from afar (pod wake, long shots) mustn't fizzle the next frame
    e.deaggroR = Math.max(e.deaggroR, dist(e.pos, this.raftCenter()) + 240)
    this.toastAt(e.pos, '⚔️ committed!', '#ff9d9d')
    sfx('spot')
    // stirring one raft wakes its podmates — pick where you engage
    for (const o of this.enemies) {
      if (o !== e && o.mode === 'roam' && dist(o.pos, e.pos) < POD_WAKE_R) this.notice(o, rand(0.7, 1.2))
    }
  }

  private updateEnemies(dt: number) {
    const center = this.raftCenter()
    for (const e of this.enemies) {
      e.chillT = Math.max(0, e.chillT - dt)
      const spd = e.speed * (e.chillT > 0 ? 0.5 : 1)
      const dx = center.x - e.pos.x
      const dy = center.y - e.pos.y
      const d = Math.hypot(dx, dy) || 1
      const ux = dx / d
      const uy = dy / d

      // staged aggro: raiders eye you (❓) for a beat before committing (⚔️) —
      // back out of range while they wonder and nothing happens
      if (e.mode === 'roam' && d < e.aggroR && this.tiles.size > 0) {
        this.notice(e)
      } else if (e.mode === 'notice') {
        e.noticeT -= dt
        // escape means opening the gap beyond where they first noticed you
        if (d > Math.max(e.aggroR, e.noticeD) + 90 || this.tiles.size === 0) {
          e.mode = 'roam'
          this.toastAt(e.pos, 'lost interest', '#9fb8c8')
        } else if (e.noticeT <= 0) {
          this.aggro(e)
        }
      } else if (e.mode === 'hunt' && d > e.deaggroR) {
        e.mode = 'roam'
        e.deaggroR = e.kind === 'harrier' ? 820 : DEAGGRO_R // shed any pod-wake stretch
        e.wanderT = rand(3, 8)
        e.wanderA = Math.atan2(-uy, -ux) // sail off, unhurried, patching up
        this.toastAt(e.pos, 'breaking off — patching up', '#9fb8c8')
      }

      if (e.mode === 'hunt') {
        const standoff = e.kind === 'harrier' ? 215 : 270
        // guns are fixed mounts with no traverse — instead of orbiting freely,
        // sail for the station where the cheapest battery bears on you
        const gun = this.bestGun(e, center, standoff)
        if (gun) {
          const fx = gun.fp.x - e.pos.x
          const fy = gun.fp.y - e.pos.y
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
          // no guns left — checkScuttle will end this raft; just close in
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
        // nest rafts stay tethered to their totem
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
        for (const t of e.tiles) {
          if (t.burnT <= 0 && t.hp < t.maxHp) {
            t.hp = Math.min(t.maxHp, t.hp + 3.5 * dt)
            patching = true
          }
          const tp = t.plant
          if (tp && tp.burnT <= 0 && tp.poisonT <= 0 && tp.hp < tp.maxHp) {
            tp.hp = Math.min(tp.maxHp, tp.hp + 2.5 * dt)
            patching = true
          }
        }
        if (patching && Math.random() < 1.5 * dt) this.puff(e.pos, '#b8e986', 1)
      }
      // separation from other rafts
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

      for (const t of e.tiles) {
        if (t.burnT > 0) {
          t.burnT -= dt
          t.hp -= 4 * dt
          if (Math.random() < 6 * dt) this.puff(this.etilePos(e, t), '#ff8c42', 1)
          if (t.hp <= 0) {
            this.destroyEnemyTile(e, t)
            continue
          }
        }
        const p = t.plant
        if (!p) continue
        if (p.burnT > 0) {
          p.burnT -= dt
          p.hp -= 3 * dt
        }
        if (p.poisonT > 0) {
          p.poisonT -= dt
          p.hp -= 2.5 * dt
        }
        if (p.hp <= 0) {
          this.killEnemyPlant(e, t)
          this.checkScuttle(e)
          continue
        }
        p.cooldown -= dt
        const from = this.etilePos(e, t)
        if (p.cooldown <= 0 && e.mode === 'hunt' && dist(from, center) < 360 && this.tiles.size > 0) {
          // gunners hold fire until the target bears on the fixed mount
          const bearing = Math.atan2(center.y - from.y, center.x - from.x)
          if (Math.abs(angleDiff(p.aim, bearing)) < GUN_ARC) {
            this.enemyFire(e, p, from)
            const diffMult = Math.max(0.7, 1.5 - e.danger * 0.08)
            p.cooldown = p.pheno.period * diffMult * (e.chillT > 0 ? 1.5 : 1) * rand(0.9, 1.15)
          }
        }
      }
    }
    // sunk rafts go; distant roamers slip over the horizon (fresh ones respawn nearer)
    this.enemies = this.enemies.filter(
      e => e.tiles.length > 0 && (e.mode === 'hunt' || dist(e.pos, center) < (e.home ? 2600 : 1700))
    )
    // a nest whose pod drifted out of the world re-arms for the next visit
    for (const p of this.activePois) {
      if (p.kind === 'nest' && p.nestUp && !p.done && !this.enemies.some(e => e.home === p)) p.nestUp = false
    }
  }

  /** the armed plant whose firing station costs the least sailing — fixed mounts
   *  can't traverse, so the raft picks the battery that bears cheapest */
  private bestGun(e: EnemyRaft, center: Vec, standoff: number): { p: Plant; fp: Vec } | null {
    let best: { p: Plant; fp: Vec; d: number } | null = null
    for (const t of e.tiles) {
      const p = t.plant
      if (!p) continue
      const fp = v(
        center.x - Math.cos(p.aim) * standoff - t.gx * TS,
        center.y - Math.sin(p.aim) * standoff - t.gy * TS
      )
      const d = dist(e.pos, fp)
      if (!best || d < best.d) best = { p, fp, d }
    }
    return best
  }

  private enemyFire(e: EnemyRaft, p: Plant, from: Vec) {
    const speed = 190
    // fixed mounts fire dead along their heading — no leading, no homing:
    // read the red arrows, stay out of the lines, outsail what does come
    const a = p.aim + rand(-0.05, 0.05)
    this.bullets.push({
      pos: v(from.x, from.y - 16),
      vel: v(Math.cos(a) * speed, Math.sin(a) * speed),
      speed,
      dmg: p.pheno.dmg * (0.75 + e.danger * 0.06),
      element: p.pheno.element,
      quirk: 'none',
      friendly: false,
      life: 6,
      pierceLeft: 0,
      hitSet: new Set(),
    })
  }

  private destroyEnemyTile(e: EnemyRaft, t: ETile) {
    const pos = this.etilePos(e, t)
    if (t.plant) this.killEnemyPlant(e, t)
    // loot scales a touch faster than the threat — pushing one ring out is always tempting
    const n = randInt(2 + Math.floor(e.danger / 3), 3 + Math.min(5, Math.floor(e.danger * 0.8)))
    this.dropLoot('wood', n, pos)
    this.burst(pos, '#8a6a45', 10)
    sfx('break')
    const i = e.tiles.indexOf(t)
    if (i >= 0) e.tiles.splice(i, 1)
    if (e.tiles.length === 0) {
      this.stats.sunk++
      this.shake = Math.min(10, this.shake + 5)
      this.dropLoot(Math.random() < 0.6 ? 'pot' : 'soil', 1, v(pos.x + rand(-20, 20), pos.y + rand(-20, 20)))
      this.dropLoot('water', 2 + Math.floor(e.danger / 2), v(pos.x + rand(-20, 20), pos.y + rand(-20, 20)))
      if (Math.random() < e.danger * 0.05) {
        this.dropLoot('seed', 1, v(pos.x + rand(-20, 20), pos.y + rand(-20, 20)), {
          id: this.seedId++,
          genome: wildGenome(1 + e.danger * 0.5),
          gen: 0,
        })
      }
      this.toastAt(pos, '☠ raft sunk!', '#ffd257')
      sfx('sunk')
      if (e.home && !this.enemies.some(o => o !== e && o.home === e.home && o.tiles.length > 0)) {
        this.nestCleared(e.home)
      }
    }
    this.checkScuttle(e)
  }

  /** a raft with no plants left has no fight left — the crew scuttles it */
  private checkScuttle(e: EnemyRaft) {
    if (e.scuttling || e.tiles.length === 0 || e.tiles.some(t => t.plant)) return
    e.scuttling = true
    this.toastAt(e.pos, 'defenseless — crew scuttles!', '#ffd257')
    while (e.tiles.length) this.destroyEnemyTile(e, e.tiles[0])
  }

  private killEnemyPlant(e: EnemyRaft, t: ETile) {
    const p = t.plant
    if (!p) return
    t.plant = null
    const pos = this.etilePos(e, t)
    this.burst(pos, '#4e9a5f', 8)
    const roll = Math.random()
    if (roll < Math.min(0.75, 0.42 + e.danger * 0.045)) {
      this.dropLoot('seed', 1, pos, { id: this.seedId++, genome: p.genome, gen: 0 })
      this.toastAt(pos, '🌰 seed adrift!', '#b8e986')
    } else if (roll < 0.85) {
      this.dropLoot('soil', 1, pos)
    }
  }

  // ---- bullets ----

  private updateBullets(dt: number) {
    const dead = new Set<Bullet>()
    for (const b of this.bullets) {
      b.life -= dt
      if (b.life <= 0) {
        dead.add(b)
        continue
      }
      // friendly shots home gently while the target tile survives;
      // raider shots fly straight — outsail them
      let aim: Vec | null = null
      if (b.friendly && b.tEnemy && b.tTile && b.tEnemy.tiles.includes(b.tTile)) {
        aim = this.etilePos(b.tEnemy, b.tTile)
      }
      if (aim) {
        const dx = aim.x - b.pos.x
        const dy = aim.y - b.pos.y
        const len = Math.hypot(dx, dy) || 1
        b.vel.x = (dx / len) * b.speed
        b.vel.y = (dy / len) * b.speed
      }
      b.pos.x += b.vel.x * dt
      b.pos.y += b.vel.y * dt

      if (b.friendly) {
        if (this.friendlyHit(b)) dead.add(b)
      } else {
        if (this.enemyHit(b)) dead.add(b)
      }
    }
    this.bullets = this.bullets.filter(b => !dead.has(b))
  }

  /** returns true if the bullet is spent */
  private friendlyHit(b: Bullet): boolean {
    for (const e of this.enemies) {
      for (const t of e.tiles) {
        const tp = this.etilePos(e, t)
        const p = t.plant
        if (p && !b.hitSet.has(p) && dist(b.pos, v(tp.x, tp.y - 14)) < 15) {
          b.hitSet.add(p)
          this.aggro(e)
          p.hp -= b.dmg * (b.element === 'venom' ? 1.6 : 1)
          if (b.element === 'ember') p.burnT = 3
          if (b.element === 'frost') e.chillT = 2.5
          if (b.element === 'venom') p.poisonT = 4
          if (b.quirk === 'leech' && b.src) b.src.water = Math.min(100, b.src.water + 2)
          this.puff(b.pos, this.bulletColor(b), 2)
          sfx('hit')
          if (p.hp <= 0) {
            this.killEnemyPlant(e, t)
            this.checkScuttle(e)
          }
          if (b.pierceLeft > 0) {
            b.pierceLeft--
            return false
          }
          return true
        }
        if (!b.hitSet.has(t) && dist(b.pos, tp) < TS * 0.55) {
          b.hitSet.add(t)
          this.aggro(e)
          t.hp -= b.dmg
          if (b.element === 'ember') t.burnT = 3
          if (b.element === 'frost') e.chillT = 2.5
          if (b.quirk === 'leech' && b.src) b.src.water = Math.min(100, b.src.water + 2)
          this.puff(b.pos, this.bulletColor(b), 2)
          sfx('hit')
          if (t.hp <= 0) this.destroyEnemyTile(e, t)
          if (b.pierceLeft > 0) {
            b.pierceLeft--
            return false
          }
          return true
        }
      }
    }
    return false
  }

  /** returns true if the bullet is spent */
  private enemyHit(b: Bullet): boolean {
    for (const t of this.tiles.values()) {
      const tp = this.tilePos(t)
      const plant = t.structure?.kind === 'pot' ? t.structure.plant : null
      if (plant && dist(b.pos, v(tp.x, tp.y - 14)) < 15) {
        plant.hp -= b.dmg * (b.element === 'venom' ? 1.6 : 1)
        if (b.element === 'ember') plant.burnT = 3
        if (b.element === 'frost') this.chillT = 2.5
        if (b.element === 'venom') plant.poisonT = 4
        this.puff(b.pos, this.bulletColor(b), 2)
        this.shake = Math.min(8, this.shake + 1)
        return true
      }
      if (dist(b.pos, tp) < TS * 0.55) {
        t.hp -= b.dmg
        if (b.element === 'ember') t.burnT = 3
        if (b.element === 'frost') this.chillT = 2.5
        this.puff(b.pos, this.bulletColor(b), 3)
        this.shake = Math.min(8, this.shake + 1.5)
        sfx('hit')
        if (t.hp <= 0) this.destroyPlayerTile(t)
        return true
      }
    }
    return false
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

  private destroyPlayerTile(tile: Tile) {
    const pos = this.tilePos(tile)
    this.tiles.delete(gkey(tile.gx, tile.gy))
    if (this.breedFirst === gkey(tile.gx, tile.gy)) this.breedFirst = null
    this.burst(pos, '#8a6a45', 12)
    this.shake = Math.min(12, this.shake + 4)
    sfx('break')
    if (this.tiles.size === 0) this.gameOver()
  }

  private gameOver() {
    this.over = true
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
    // flotsam rides the wind past your raft — set an intercept course or let it go
    const c = this.raftCenter()
    const angle = this.wind.a + Math.PI + rand(-1.3, 1.3) // upwind side, so it drifts through
    const d = rand(380, 640)
    const pos = v(c.x + Math.cos(angle) * d, c.y + Math.sin(angle) * d)
    const drift = rand(0.22, 0.4)
    const vel = v(
      Math.cos(this.wind.a) * this.wind.speed * drift + rand(-5, 5),
      Math.sin(this.wind.a) * this.wind.speed * drift + rand(-5, 5)
    )
    const roll = Math.random()
    let loot: Loot
    if (roll < 0.42) loot = { kind: 'wood', n: randInt(2, 3), seed: undefined, pos, vel, ttl: 70, phase: rand(6) }
    else if (roll < 0.58) loot = { kind: 'soil', n: 1, seed: undefined, pos, vel, ttl: 70, phase: rand(6) }
    else if (roll < 0.72) loot = { kind: 'pot', n: 1, seed: undefined, pos, vel, ttl: 70, phase: rand(6) }
    else if (roll < 0.86) loot = { kind: 'water', n: 2, seed: undefined, pos, vel, ttl: 70, phase: rand(6) }
    else
      loot = {
        kind: 'seed',
        n: 1,
        seed: { id: this.seedId++, genome: wildGenome(1 + this.dangerAt(c) * 0.45), gen: 0 },
        pos,
        vel,
        ttl: 70,
        phase: rand(6),
      }
    this.loot.push(loot)
  }

  private updateLoot(dt: number) {
    const center = this.raftCenter()
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
      for (const t of this.tiles.values()) {
        if (dist(l.pos, this.tilePos(t)) < TS * 0.8) {
          this.collect(l)
          taken.add(l)
          break
        }
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
      case 'pot':
        this.pots += l.n
        this.toastAt(l.pos, '+1🏺', '#e8a87c')
        break
      case 'soil':
        this.soil += l.n
        this.toastAt(l.pos, '+1🟤', '#c5a880')
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
    // keep the surrounding waters populated with roaming raiders
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      this.spawnT = 4
      const danger = this.dangerAt(this.raftCenter())
      const cap = Math.min(8, 3 + Math.floor(danger / 2))
      if (this.enemies.length < cap) {
        if (danger > 1.6 && Math.random() < 0.22) this.spawnPod()
        else this.spawnEnemyRaft()
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
    for (const t of this.tiles.values()) {
      const p = t.structure?.kind === 'pot' ? t.structure.plant : null
      if (!p) continue
      const tp = this.tilePos(t)
      if (dist(this.hover, v(tp.x, tp.y - 12)) < 20) {
        this.hoverInfo = { plant: p, hostile: false, pos: tp }
        return
      }
    }
    for (const e of this.enemies) {
      for (const t of e.tiles) {
        if (!t.plant) continue
        const tp = this.etilePos(e, t)
        if (dist(this.hover, v(tp.x, tp.y - 12)) < 20) {
          this.hoverInfo = { plant: t.plant, hostile: true, pos: tp }
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
        this.breedFirst = null
        this.aimFirst = null
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
    if (this.paused) return
    this.worldClick(this.screenToWorld(mx, my))
  }

  rightClick() {
    this.breedFirst = null
    this.aimFirst = null
  }

  wheel(dir: number) {
    if (this.tool === 'plant') {
      this.seedScroll = clamp(this.seedScroll + dir, 0, Math.max(0, this.seeds.length - 8))
    }
  }

  keydown(code: string) {
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'].indexOf(code)
    if (idx >= 0 && idx < TOOLS.length) {
      this.tool = TOOLS[idx].tool
      this.breedFirst = null
      this.aimFirst = null
      return
    }
    switch (code) {
      case 'KeyQ':
        if (this.seeds.length) this.seedSel = (this.seedSel + this.seeds.length - 1) % this.seeds.length
        break
      case 'KeyE':
        if (this.seeds.length) this.seedSel = (this.seedSel + 1) % this.seeds.length
        break
      case 'KeyT':
        if (!this.over && !this.paused && !this.helpOpen) this.tryTrade()
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
      case 'Escape':
        this.breedFirst = null
        this.aimFirst = null
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

  private worldClick(w: Vec) {
    const gx = Math.round((w.x - this.raft.pos.x) / TS)
    const gy = Math.round((w.y - this.raft.pos.y) / TS)
    const key = gkey(gx, gy)
    const tile = this.tiles.get(key)

    switch (this.tool) {
      case 'build':
        if (tile) {
          if (tile.hp >= TILE_HP) return this.toast('tile is sound')
          if (this.wood < 1) return this.toast('need 1🪵')
          this.wood--
          tile.hp = Math.min(TILE_HP, tile.hp + 30)
          this.puff(this.tilePos(tile), '#e8c98a', 4)
          sfx('build')
        } else {
          if (!this.isBuildable(gx, gy)) return
          if (this.wood < BUILD_COST) return this.toast(`need ${BUILD_COST}🪵`)
          this.wood -= BUILD_COST
          this.tiles.set(key, { gx, gy, hp: TILE_HP, structure: null, burnT: 0 })
          this.puff(this.tilePos({ gx, gy }), '#e8c98a', 6)
          sfx('build')
        }
        break

      case 'pot':
        if (!tile) return
        if (tile.structure) return this.toast('tile occupied')
        if (this.pots < 1) return this.toast('need a pot 🏺')
        if (this.soil < 1) return this.toast('need soil 🟤')
        this.pots--
        this.soil--
        tile.structure = { kind: 'pot', plant: null }
        sfx('build')
        break

      case 'plant': {
        if (!tile || tile.structure?.kind !== 'pot') return
        if (tile.structure.plant) return this.toast('pot occupied')
        if (!this.seeds.length) return this.toast('no seeds — breed or loot')
        const seed = this.seeds.splice(this.seedSel, 1)[0]
        this.seedSel = clamp(this.seedSel, 0, Math.max(0, this.seeds.length - 1))
        this.seedScroll = clamp(this.seedScroll, 0, Math.max(0, this.seeds.length - 8))
        tile.structure.plant = makePlant(seed.genome, seed.gen)
        this.toastAt(this.tilePos(tile), `🌱 ${phenotype(seed.genome).name}`, '#b8e986')
        sfx('build')
        break
      }

      case 'water': {
        const p = tile?.structure?.kind === 'pot' ? tile.structure.plant : null
        if (!tile || !p) return
        if (this.water < 1) return this.toast('no fresh water — stoke a boiler')
        if (p.water >= 100) return this.toast('already soaked')
        this.water--
        p.water = Math.min(100, p.water + WATER_PER_USE)
        p.dryTime = 0
        this.puff(v(this.tilePos(tile).x, this.tilePos(tile).y - 14), '#7fd8ff', 5)
        sfx('water')
        break
      }

      case 'breed':
        this.breedClick(tile)
        break

      case 'boiler':
        if (!tile) return
        if (tile.structure?.kind === 'boiler') {
          if (this.wood < 1) return this.toast('need 1🪵 to stoke')
          if (tile.structure.fuel >= FUEL_CAP) return this.toast('boiler is full')
          this.wood--
          tile.structure.fuel++
          this.toastAt(this.tilePos(tile), '+fuel 🔥', '#ff8c42')
          sfx('build')
        } else if (!tile.structure) {
          if (this.wood < BOILER_COST) return this.toast(`need ${BOILER_COST}🪵`)
          this.wood -= BOILER_COST
          tile.structure = { kind: 'boiler', fuel: 0, progress: 0 }
          sfx('build')
        } else {
          this.toast('tile occupied')
        }
        break

      case 'remove':
        if (!tile || !tile.structure) return
        if (tile.structure.kind === 'pot') {
          if (tile.structure.plant) {
            tile.structure.plant = null
            this.toastAt(this.tilePos(tile), 'dug up 🥀', '#c5b8a0')
            if (this.breedFirst === key) this.breedFirst = null
          } else {
            tile.structure = null
            this.pots++
            this.toastAt(this.tilePos(tile), '+1🏺', '#e8a87c')
          }
        } else {
          tile.structure = null
          this.wood += 2
          this.toastAt(this.tilePos(tile), '+2🪵', '#e8c98a')
        }
        break

      case 'aim': {
        if (this.inCombat()) return this.toast('re-aim only out of combat')
        const p = tile?.structure?.kind === 'pot' ? tile.structure.plant : null
        if (!this.aimFirst) {
          if (!tile || !p) return
          this.aimFirst = key
          this.toastAt(this.tilePos(tile), 'aim where? 🎯', '#ffd257')
          return
        }
        // second click sets the heading; clicking the same plant cancels
        const firstTile = this.tiles.get(this.aimFirst)
        const first = firstTile?.structure?.kind === 'pot' ? firstTile.structure.plant : null
        if (!firstTile || !first) {
          this.aimFirst = null
          return
        }
        if (this.aimFirst === key) {
          this.aimFirst = null
          return
        }
        const fpos = this.tilePos(firstTile)
        first.aim = Math.atan2(w.y - fpos.y, w.x - fpos.x)
        this.aimFirst = null
        this.puff(v(fpos.x, fpos.y - 16), '#ffd257', 4)
        this.toastAt(fpos, 'heading set 🎯', '#ffd257')
        sfx('build')
        break
      }
    }
  }

  isBuildable(gx: number, gy: number): boolean {
    if (this.tiles.has(gkey(gx, gy))) return false
    return (
      this.tiles.has(gkey(gx + 1, gy)) ||
      this.tiles.has(gkey(gx - 1, gy)) ||
      this.tiles.has(gkey(gx, gy + 1)) ||
      this.tiles.has(gkey(gx, gy - 1))
    )
  }

  buildableCells(): { gx: number; gy: number }[] {
    const out = new Map<string, { gx: number; gy: number }>()
    for (const t of this.tiles.values()) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const gx = t.gx + dx
        const gy = t.gy + dy
        const k = gkey(gx, gy)
        if (!this.tiles.has(k) && !out.has(k)) out.set(k, { gx, gy })
      }
    }
    return [...out.values()]
  }

  private breedClick(tile: Tile | undefined) {
    const plant = tile?.structure?.kind === 'pot' ? tile.structure.plant : null
    if (!tile || !plant) return
    const key = gkey(tile.gx, tile.gy)
    if (plant.growth < 1) return this.toast('not mature yet')
    if (plant.breedCd > 0) return this.toast(`resting ${Math.ceil(plant.breedCd)}s`)

    if (!this.breedFirst) {
      this.breedFirst = key
      this.toastAt(this.tilePos(tile), 'pick a partner 🐝', '#ffd257')
      return
    }
    if (this.breedFirst === key) {
      this.breedFirst = null
      return
    }
    const firstTile = this.tiles.get(this.breedFirst)
    const first = firstTile?.structure?.kind === 'pot' ? firstTile.structure.plant : null
    if (!firstTile || !first || first.growth < 1 || first.breedCd > 0) {
      this.breedFirst = null
      return
    }
    if (Math.max(Math.abs(firstTile.gx - tile.gx), Math.abs(firstTile.gy - tile.gy)) > 2) {
      return this.toast('too far apart (≤2 tiles)')
    }
    if (this.water < BREED_COST) return this.toast(`need ${BREED_COST}💧`)

    this.water -= BREED_COST
    first.breedCd = BREED_CD
    plant.breedCd = BREED_CD
    const gen = Math.max(first.gen, plant.gen) + 1
    const make = () => ({ id: this.seedId++, genome: breed(first.genome, plant.genome), gen })
    this.seeds.push(make())
    let msg = '🌰 new seed!'
    if (Math.random() < 0.3) {
      this.seeds.push(make())
      msg = '🌰🌰 twin seeds!'
    }
    this.stats.bred++
    this.breedFirst = null
    this.burst(this.tilePos(tile), '#ffd257', 8)
    this.burst(this.tilePos(firstTile), '#ffd257', 8)
    this.toastAt(this.tilePos(tile), `${msg} (F${gen})`, '#ffd257')
    sfx('breed')
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
