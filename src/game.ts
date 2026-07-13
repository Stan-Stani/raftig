import { Vec, v, dist, clamp, rand, randInt, gkey, angleDiff, weighted, pick } from './util'
import {
  Genome,
  Seed,
  Pheno,
  phenotype,
  wildGenome,
  makeGenome,
  carriesRare,
  alleleDef,
  AlleleDef,
  LocusId,
  LOCUS_ORDER,
  RegionLock,
  REGION_LOCKS,
  REGION_ARC,
  regionLockOf,
  randomizeRegions,
} from './genetics'
import { Tool, TOOLS, toolbarLayout, seedRowRects, seedPanelRect, restartRect, inRect, SEED_VISIBLE, boardLayout } from './ui'
import {
  Board,
  BoardParent,
  openBoard,
  boardCommit,
  boardFocus,
  boardChoose,
  boardPlace,
  boardAuto,
  boardRemoveStock,
  picksCost,
  DOCK_RANGE,
  POLLEN_START,
} from './breeding'
import { POI, POI_CELL, POI_SIGHT, cellPOI, makePOI, TRADE_COST, TRADE_RANGE, BREED_COST } from './poi'
import { keys } from './input'
import { sfx, toggleMute } from './audio'

export const TS = 46 // legacy sprite scale (trader rafts, bars)
export const RANGE = 280 // baseline reach, px — the inCombat() floor before scanning the deck
export const SPLASH = 44 // mortar burst radius, px
export const PLANT_HP = 40
export const ELEV_MIN = 0.5 // lowest battery elevation — rings pull in to half reach
export const ELEV_RATE = 0.45 // elevation change per second while Z/X is held
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
export const SLOOP_BOLD_FLEE_HP = 0.4 // a bold sloop only sheets away once hurt this badly
export const SLOOP_KITE_PATIENCE_MULT = 1.6 // running scared burns patience faster than trading shots
export const SLOOP_BOLD_STATION = 400 // a bold sloop brawls at this range, not its full bred glass

/** the named danger bands — geography the crew can point at */
export function seaName(danger: number): string {
  return danger < 2 ? 'home waters' : danger < 4 ? 'open sea' : danger < 6 ? 'raider seas' : 'deadly waters'
}

/** rumor-speak for a region's compass sector (canvas y-down: north = -π/2) */
export function compassWord(heading: number | null): string {
  if (heading === null) return 'far from any shore'
  const names: [number, string][] = [
    [0, 'to the east'],
    [Math.PI / 2, 'to the south'],
    [Math.PI, 'to the west'],
    [-Math.PI / 2, 'to the north'],
  ]
  let best = names[0]
  for (const n of names) if (Math.abs(angleDiff(heading, n[0])) < Math.abs(angleDiff(heading, best[0]))) best = n
  return best[1]
}
export const FOG_CELL = 280 // minimap fog-of-war resolution
export const FOG_SIGHT = 640 // radius revealed around the ship
export const BREEDER_SPEED = 24 // px/s the wandering breeder boat drifts
/** one "normal" shot's worth of damage — fireship hulls are priced in these */
export const FIRESHIP_HIT = 8

export interface Plant {
  genome: Genome
  gen: number
  pheno: Pheno
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
  /** firing heading, radians. Hull-relative on your ship (always the mount's
   *  natural facing — the helm is the only traverse); world-fixed on raider
   *  ships, except that a hunting raider's mount grinds slowly toward you. */
  aim: number
  /** barrel elevation 0.5..1 — bee fortress gunners crank their reticules in
   *  and out like your Z/X battery. Unset on ship guns (fixed full reach). */
  elev?: number
}

/** a gun mount bolted to the deck — local coords, prow = +x */
export interface Mount {
  x: number
  y: number
  aim0: number // the mount's natural facing; new plants point this way
  plant: Plant | null
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
  /** the class's full patience — what refreshes restore */
  patience0: number
  /** lookout lag, s — steering reads the player's course this far in the past,
   *  so the pack reacts to your moves instead of mirroring your inputs */
  reactT: number
  /** harrier oar stamina 0..1 — sprints drain it, rest refills it */
  row: number
  danger: number // difficulty of the waters it spawned in
  /** the fleet's classes, each a doctrine: raiders brawl · harriers row & sprint ·
   *  sloops snipe long and flee the brawl · galleons tank and out-gun ·
   *  fireships rush the hull and burn with it · mortars dig in at range and
   *  RANGE YOU IN for real (lead + crank elevation) instead of holding a dumb
   *  station · bastions are a hive's garrison — a fortress battery that
   *  cannot chase and never needs to */
  kind: 'raider' | 'harrier' | 'sloop' | 'galleon' | 'fireship' | 'mortar' | 'bastion'
  /** fireship plating: 0 bare (pops to one normal hit), 1 bronze, 2 iron */
  armor?: 0 | 1 | 2
  /** ship belongs to a nest and stays tethered to it */
  home?: POI
  /** holds one of the HUNT_CAP attack slots — shadowers wait outside gun range */
  engaged?: boolean
  /** mid-scuttle guard — the hull is going down, don't re-enter */
  scuttling?: boolean
  sunk?: boolean
  /** stung by hive artillery: drops nothing until the crew fully patches the
   *  hull and the player lands the kill themselves */
  beeHit?: boolean
  /** the smarter crews give bee fortresses a wide berth */
  wary?: boolean
  /** a jumpy sloop crew: sheets away on proximity alone, full health or not.
   *  bold sloops (the rest) stand and trade until they're actually hurt */
  riskAverse?: boolean
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
  /** fired by a hive garrison: hits raiders too, and taints their salvage */
  bee?: boolean
  /** inherited (homing quirk): a friendly shell curves toward the nearest
   *  raider in flight; an enemy one curves toward you */
  homing?: boolean
  /** firing heading, so an airburst's cluster radiates from the burst point */
  heading?: number
  /** inherited (burst locus): shell scatters a cluster volley where it bursts */
  airburst?: boolean
}

export type LootKind = 'wood' | 'seed' | 'water' | 'pollen'
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

/** how far a hunter presses before the chase fizzles — sloops and fireships range widest */
function baseDeaggro(kind: EnemyShip['kind']): number {
  return kind === 'harrier'
    ? 820
    : kind === 'sloop'
      ? 900
      : kind === 'mortar'
        ? 680 // it doesn't chase so much as keep pressuring from where it's dug in
        : kind === 'fireship'
          ? 950
          : kind === 'bastion'
            ? 1150
            : DEAGGRO_R
}

/** rad/s a hunting mount grinds toward you — the ship holds range, the gun does
 *  the lining-up, and the red ring telegraphs every degree of it */
function gunTraverse(kind: EnemyShip['kind']): number {
  // bastion/mortar gunners are drilled: they range in for real, so the gun
  // doing more of the work is the point, not a limitation
  return kind === 'harrier'
    ? 0.9
    : kind === 'sloop'
      ? 0.7
      : kind === 'galleon'
        ? 0.35
        : kind === 'bastion'
          ? 0.6
          : kind === 'mortar'
            ? 0.55
            : 0.5
}

function makePlant(genome: Genome, gen: number): Plant {
  return {
    genome,
    gen,
    pheno: phenotype(genome),
    water: 100,
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

  /** pollen — the currency that buys rare-allele placements on the channeling board */
  pollen = POLLEN_START
  /** crosses in a row that surfaced no rare — feeds the pity floor */

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
  /** the wandering breeder boat — a single mover, not tied to any cell */
  breeder: POI | null = null
  /** fog-of-war: minimap cells the ship has sailed near */
  seen = new Set<string>()
  fogT = 0

  tool: Tool = 'water'
  seedSel = 0
  seedScroll = 0
  /** armed by a first click on a planted mount — a second click on the SAME
   *  mount within the window actually digs it up. Stops a stray click from
   *  destroying a plant for good */
  pendingDig: Mount | null = null
  pendingDigT = 0
  /** the channeling board — non-null while docked at a port/breeder, breeding */
  board: Board | null = null
  /** feedback line drawn on the channeling board — world toasts hide behind the modal */
  boardMsg: { text: string; t: number; color: string } | null = null
  /** region-gene gossip heard at ports this run, keyed 'locus:allele' */
  rumors = new Set<string>()
  /** the standing bee bounty — sink ships, collect pollen. One at a time.
   *  `hive` is who struck it, so fulfilling it can raise that hive's own
   *  repeat-business rate for next time */
  contract: { need: number; got: number; pay: number; hive: POI } | null = null
  /** you broke a hive: every fortress is hostile and no bee pays you again this run */
  beesAngry = false

  firing = false // set by the fire key, consumed each frame → one broadside per press
  /** battery elevation, ELEV_MIN..1 — scales every gun's burst distance; Z lowers, X raises */
  elev = 1
  /** last time a leech proc floated its +💧 — throttles the toast, not the effect */
  private leechToastT = -9
  /** ~1.5s of the ship's course — enemy lookouts steer from reactT seconds back */
  private shipTrail: { x: number; y: number; vx: number; vy: number; t: number }[] = []
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
    this.mounts = TIERS[0].mounts.map(m => ({ x: m.x, y: m.y, aim0: m.aim, plant: null }))
    this.burnT = 0
    // one basic shooter on the port mount so wave 1 is survivable
    const starter = makePlant(makeGenome(), 0)
    starter.aim = this.mounts[0].aim0
    this.mounts[0].plant = starter

    this.wood = 8
    this.water = 6
    this.pollen = POLLEN_START
    this.contract = null
    this.beesAngry = false
    // the sea re-deals its gene regions every run — rumors are the only map
    randomizeRegions()
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
    // a breeder boat wanders the far horizon from the start — find it for a
    // premium cross; ports are the reliable anchor in between
    this.breeder = makePOI('breeder', v(Math.cos(wa + 2.3) * 1500, Math.sin(wa + 2.3) * 1500))
    this.breeder.heading = wa + 2.3 + Math.PI
    this.seen = new Set()
    this.fogT = 0
    // a guaranteed first sight: smoke on the horizon in a random direction
    const swa = rand(Math.PI * 2)
    this.pois.set('start', makePOI('wreck', v(Math.cos(swa) * 700, Math.sin(swa) * 700)))
    // and a bee fortress at the edge of home waters — the pollen economy's
    // front door: there is always a bounty within an early sail
    const hwa = swa + rand(1.5, Math.PI * 2 - 1.5)
    this.pois.set('homehive', makePOI('hive', v(Math.cos(hwa) * 850, Math.sin(hwa) * 850)))
    this.tool = 'water'
    this.seedSel = 0
    this.seedScroll = 0
    this.board = null
    this.boardMsg = null
    this.rumors = new Set()
    this.elev = 1
    this.leechToastT = -9
    this.shipTrail = []
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

  /** is a locked gene's home region at p? — deep enough, right compass sector */
  inRegion(p: Vec, lock: RegionLock): boolean {
    if (this.dangerAt(p) < lock.minDanger) return false
    if (lock.heading === null) return true
    return Math.abs(angleDiff(Math.atan2(p.y, p.x), lock.heading)) <= REGION_ARC
  }

  /** wild-gene weights for the waters at p: region-locked alleles are absent
   *  outside their home region and bloom thick inside it */
  regionMul(p: Vec): (locus: LocusId, a: AlleleDef) => number {
    return (locus, a) => {
      const lock = regionLockOf(locus, a.id)
      return lock ? (this.inRegion(p, lock) ? 3 : 0) : 1
    }
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
      if (p && p.water > 0 && p.pheno.quirk === 'magnet') return true
    }
    return false
  }

  // ---- update ----

  update(dt: number) {
    this.cam = this.ship.pos
    this.hover = this.screenToWorld(this.hoverScreen.x, this.hoverScreen.y)
    if (this.over || this.paused || this.helpOpen || this.board) {
      this.updateFx(dt)
      return
    }
    this.time += dt
    this.stats.time += dt
    this.chillT = Math.max(0, this.chillT - dt)
    if (this.pendingDig) {
      this.pendingDigT -= dt
      if (this.pendingDigT <= 0) this.pendingDig = null
    }

    this.updateWind(dt)
    this.updatePOIs(dt)
    this.updateMovement(dt)
    this.updateShip(dt)
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

    // the breeder boat is a lone mover: it meanders on its heading and, if it
    // slips too far, reappears over the horizon somewhere new — so there is
    // always one out there to hunt for
    const br = this.breeder
    if (br) {
      const bh = br.heading ?? 0
      br.pos.x += Math.cos(bh) * BREEDER_SPEED * dt
      br.pos.y += Math.sin(bh) * BREEDER_SPEED * dt
      br.heading = bh + Math.sin(this.time * 0.17) * 0.5 * dt
      if (dist(br.pos, c) > 3400) {
        const a = rand(Math.PI * 2)
        br.pos = v(c.x + Math.cos(a) * 2500, c.y + Math.sin(a) * 2500)
        br.heading = a + Math.PI + rand(-0.5, 0.5)
        br.discovered = false
      }
      this.activePois.push(br)
    }

    for (const p of this.activePois) {
      const d = dist(p.pos, c)
      if (!p.discovered && d < POI_SIGHT[p.kind]) p.discovered = true
      if (p.done) continue
      if (p.kind === 'wreck' && d < p.r) this.salvageWreck(p)
      if (p.kind === 'nest' && !p.nestUp && d < 1250) this.spawnNest(p)
      if (p.kind === 'calm' && !p.seeded && d < POI_SIGHT.calm) this.seedCalm(p)
      // a hive mans its walls when there's shooting to do: a grudge (or open war)
      // against the player, or any raider sail prowling its waters
      if (p.kind === 'hive') {
        if ((p.hostile || this.beesAngry) && d < 1000) this.garrison(p)
        else if (this.enemies.some(e => e.kind !== 'bastion' && !e.sunk && dist(e.pos, p.pos) < 800)) this.garrison(p)
      }
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
    this.dropLoot('water', 1 + Math.floor(danger / 4), scatter())
    const nSeeds = 1 + (danger >= 4 ? 1 : 0)
    for (let i = 0; i < nSeeds; i++) {
      this.dropLoot('seed', 1, scatter(), { id: this.seedId++, genome: wildGenome(1 + danger * 0.5, this.regionMul(p.pos)), gen: 0 })
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
      this.dropLoot('seed', 1, scatter(), { id: this.seedId++, genome: wildGenome(2 + danger * 0.5, this.regionMul(p.pos)), gen: 0 })
    }
    this.dropLoot('wood', randInt(5, 8), scatter())
    this.dropLoot('water', 1, scatter())
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
      if (roll < 0.58) this.dropLoot('wood', randInt(2, 3), at)
      else if (roll < 0.86) this.dropLoot('water', 1, at)
      else this.dropLoot('seed', 1, at, { id: this.seedId++, genome: wildGenome(1 + danger * 0.4, this.regionMul(p.pos)), gen: 0 })
    }
    for (const l of this.loot.slice(-n)) {
      l.ttl = 999
      l.vel = v(0, 0)
    }
  }

  // ---- the bee faction: fortress hives, bounty contracts, and the war you can start ----

  /** the hive's standing garrison, if its walls are currently manned */
  private hiveGarrison(p: POI): EnemyShip | undefined {
    return this.enemies.find(e => e.kind === 'bastion' && e.home === p && !e.sunk)
  }

  /** man the walls: raise the fortress battery on the island (idempotent) */
  private garrison(p: POI): EnemyShip {
    const up = this.hiveGarrison(p)
    if (up) return up
    this.spawnEnemyShip({ at: v(p.pos.x, p.pos.y), kind: 'bastion', home: p })
    return this.enemies[this.enemies.length - 1]
  }

  /** you fired on the bees: the island rises, and any bounty is void */
  provokeHive(p: POI) {
    const first = !p.hostile
    p.hostile = true
    const e = this.garrison(p)
    this.aggro(e)
    if (first) {
      this.toastAt(p.pos, '🐝 the hive rises!', '#ffd257')
      if (this.contract) {
        this.contract = null
        this.toastAt(this.ship.pos, 'bounty void — you fired on the bees', '#ff9d9d')
      }
    }
  }

  /** the garrison fell: the island goes quiet, coughs up its pollen stores —
   *  and every hive on the sea learns your sail. No bee pays you again. */
  private hiveFallen(p: POI) {
    p.done = true
    p.hostile = false
    this.beesAngry = true
    this.contract = null
    const scatter = () => v(p.pos.x + rand(-90, 90), p.pos.y + rand(-90, 90))
    const cache = 8 + Math.floor(this.dangerAt(p.pos))
    for (let left = cache; left > 0; ) {
      const n = Math.min(left, randInt(2, 3))
      this.dropLoot('pollen', n, scatter())
      left -= n
    }
    this.dropLoot('wood', randInt(4, 7), scatter())
    this.banner = { title: '🍯 hive broken', sub: 'the pollen is yours — the swarm will remember', t: 4 }
    this.burst(p.pos, '#ffd257', 20)
  }

  /** parley at a hive (T): strike a bounty, sue for peace with a grudge you
   *  haven't broken, or hear how the swarm feels about you */
  private parleyHive(p: POI) {
    if (p.done) return this.toastAt(p.pos, 'the hive is silent', '#9fb8c8')
    // war (a broken hive, anywhere) is the one grudge nothing buys back —
    // a live grudge on a still-standing hive is just a fine away from over
    if (this.beesAngry) return this.toastAt(p.pos, '🐝 the swarm remembers your smoke', '#ff9d9d')
    if (p.hostile) return this.suePeace(p)
    if (this.contract) {
      const c = this.contract
      return this.toastAt(p.pos, `🐝 bounty stands: ${c.got}/${c.need} sunk → ${c.pay}🌼`, '#ffd257')
    }
    const danger = this.dangerAt(p.pos)
    // repeat business steepens the terms: the first bounty at a hive is the
    // cheap one, and each one you've already fulfilled here adds to the ask
    const need = 2 + Math.min(3, Math.floor(danger / 3)) + Math.min(4, p.bounties)
    const pay = need * 2 // one clean bounty funds at least one 4🌼 cross
    this.contract = { need, got: 0, pay, hive: p }
    this.toastAt(p.pos, `🐝 bounty struck: sink ${need} raiders → ${pay}🌼`, '#ffd257')
    sfx('build')
  }

  /** the pollen price of standing a grudge-hive's walls back down — costs
   *  more the deeper the water, the swarm out here has less patience for you */
  peaceTribute(p: POI): number {
    return 8 + Math.floor(this.dangerAt(p.pos))
  }

  /** T at a hive whose garrison you've provoked but not broken: pay tribute
   *  to stand the walls down and go back to bounty terms. Always goes through
   *  — short a full purse just runs your pollen into debt, no cross clears
   *  until you've bounty'd your way back to zero */
  private suePeace(p: POI) {
    const tribute = this.peaceTribute(p)
    this.pollen -= tribute
    p.hostile = false
    const g = this.hiveGarrison(p)
    if (g) {
      g.mode = 'roam'
      g.engaged = false
    }
    this.toastAt(p.pos, `🐝 peace bought — ${tribute}🌼`, '#ffd257')
    sfx('build')
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
      // traders sell what grows where they anchor — a northern trader is a frost stall
      const seed = { id: this.seedId++, genome: wildGenome(1.4 + danger * 0.4, this.regionMul(p.pos)), gen: 0 }
      this.seeds.push(seed)
      this.toastAt(p.pos, `🌰 ${phenotype(seed.genome).name}`, '#b8e986')
      if (p.stock <= 0) {
        p.done = true
        this.toastAt(v(p.pos.x, p.pos.y - 24), 'sold out — fair winds!', '#9fb8c8')
      }
      sfx('breed')
      return
    }
    // no trader in earshot — a hive alongside answers T with bounty talk
    const hive = this.activePois.find(p => p.kind === 'hive' && dist(p.pos, c) <= p.r + 130)
    if (hive) this.parleyHive(hive)
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
    if (this.boardMsg && (this.boardMsg.t -= dt) <= 0) this.boardMsg = null
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
      const maxSpeed = 240 * eff * gust * (this.chillT > 0 ? 0.55 : 1)
      this.ship.vel.x += Math.cos(this.ship.a) * 520 * eff * gust * dt
      this.ship.vel.y += Math.sin(this.ship.a) * 520 * eff * gust * dt
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
      if (sternway < 84) {
        this.ship.vel.x -= Math.cos(this.ship.a) * 200 * dt
        this.ship.vel.y -= Math.sin(this.ship.a) * 200 * dt
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
    // log the course for the lookouts (enemy steering reads reactT seconds back)
    this.shipTrail.push({ x: this.ship.pos.x, y: this.ship.pos.y, vx: this.ship.vel.x, vy: this.ship.vel.y, t: this.time })
    while (this.shipTrail.length && this.shipTrail[0].t < this.time - 1.5) this.shipTrail.shift()
  }

  /** the ship as an enemy lookout remembers it — its course `ago` seconds back */
  private shipAt(ago: number): { x: number; y: number; vx: number; vy: number } {
    const target = this.time - ago
    const tr = this.shipTrail
    for (let i = tr.length - 1; i >= 0; i--) {
      if (tr[i].t <= target) return tr[i]
    }
    return tr[0] ?? { x: this.ship.pos.x, y: this.ship.pos.y, vx: this.ship.vel.x, vy: this.ship.vel.y }
  }

  private updateShip(dt: number) {
    // gunnery elevation: hold Z to lower the whole battery (rings pull in),
    // X to raise it back toward each gun's full bred reach — live mid-fight
    const lower = keys.has('KeyZ')
    const raise = keys.has('KeyX')
    if (lower !== raise) this.elev = clamp(this.elev + (raise ? 1 : -1) * ELEV_RATE * dt, ELEV_MIN, 1)

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

      // thirst — plants gulp in battle, only sip at rest
      if (p.water > 0) {
        p.dryTime = 0
      } else {
        p.dryTime += dt
        if (p.dryTime > 6) p.hp -= 2 * dt
      }
      p.activeT = Math.max(0, p.activeT - dt)
      const thirst = p.activeT > 0 ? 0.3 : 0.04
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
      // the lanyard (Space). Each shell bursts at the plant's bred reach scaled by
      // the battery elevation — the helm walks the burst rings over a target, the
      // reach gene caps the ring, Z/X pull it in, and firing starts the reload.
      if (this.firing && p.water > 0 && p.cooldown <= 0) {
        this.firePlant(m, this.mountPos(m))
        p.cooldown = p.pheno.period * (this.chillT > 0 ? 1.35 : 1)
        p.water = Math.max(0, p.water - 0.1)
      }
    }
    this.firing = false // consumed this frame; a fresh press re-arms it
    if (this.ship.hp <= 0 && !this.over) this.gameOver()
  }

  /** the eligible parents for a cross at a port/breeder: every watered deck
   *  plant plus every seed in the pouch. Breeding reads a genome, it never
   *  consumes the parent — so fielding a line is joining it to your program. */
  breedingStock(): BoardParent[] {
    const stock: BoardParent[] = []
    for (const m of this.mounts) {
      const p = m.plant
      if (p && p.water > 0) {
        stock.push({ genome: p.genome, gen: p.gen, label: 'deck', name: p.pheno.name })
      }
    }
    for (const s of this.seeds) {
      stock.push({ genome: s.genome, gen: s.gen, label: 'pouch', name: phenotype(s.genome).name, seedId: s.id })
    }
    return stock
  }

  /** F — dock at a port or the breeder boat in range and open the channeling
   *  board. The breeder boat wins ties: it's the premium cross. */
  tryDock() {
    if (this.board || this.over || this.paused || this.helpOpen) return
    const c = this.ship.pos
    // a friendly hive breeds like any port (T handles the bounty talk); a
    // grudge — or a broken dome — closes the docks
    const hive = this.activePois.find(p => p.kind === 'hive' && dist(p.pos, c) <= p.r + 130)
    let premium = false
    let atPort = false
    if (hive && (hive.done || hive.hostile || this.beesAngry)) {
      return this.toastAt(hive.pos, hive.done ? 'the hive is silent' : '🐝 the swarm remembers your smoke', '#9fb8c8')
    } else if (hive) {
      // friendly hive dock — normal cross, bees don't gossip like portmasters
    } else if (this.breeder && dist(this.breeder.pos, c) <= DOCK_RANGE) {
      premium = true
    } else if (this.activePois.some(p => p.kind === 'port' && !p.done && dist(p.pos, c) <= DOCK_RANGE)) {
      atPort = true
    } else {
      return this.toast('no port, hive, or breeder boat in range')
    }
    const stock = this.breedingStock()
    if (stock.length < 2) return this.toast('need two watered plants or seeds to cross')
    this.board = openBoard(premium, stock, this.pollen)
    this.boardMsg = null
    // portmasters gossip about where the locked genes grow — the map's real currency
    if (atPort) this.shareRumor()
    sfx('build')
  }

  /** every allele the player's lines carry anywhere — deck plants and pouch */
  ownedAlleleKeys(): Set<string> {
    const owned = new Set<string>()
    const add = (g: Genome) => {
      for (const l of LOCUS_ORDER) for (const id of g[l]) owned.add(l + ':' + id)
    }
    for (const m of this.mounts) if (m.plant) add(m.plant.genome)
    for (const s of this.seeds) add(s.genome)
    return owned
  }

  /** one rumor per port visit: unheard locks first (shallowest — the natural
   *  breadcrumb order), then reminders of heard-but-uncaught genes */
  private shareRumor() {
    const key = (l: RegionLock) => l.locus + ':' + l.allele
    const unheard = REGION_LOCKS.filter(l => !this.rumors.has(key(l))).sort((a, b) => a.minDanger - b.minDanger)
    const owned = this.ownedAlleleKeys()
    const uncaught = REGION_LOCKS.filter(l => !owned.has(key(l)))
    const lock = unheard[0] ?? (uncaught.length ? pick(uncaught) : null)
    if (!lock) return // every locked gene is already in the player's lines
    this.rumors.add(key(lock))
    const label = alleleDef(lock.locus, lock.allele).label
    this.boardMsg = {
      text: `🗺 rumor: ${label} blooms in the ${seaName(lock.minDanger)} ${compassWord(lock.heading)}`,
      t: 8,
      color: '#ffd257',
    }
  }

  /** commit the current board: mint the crossed seed into the pouch */
  private commitBoard() {
    const b = this.board
    if (!b) return
    if (this.seeds.length >= POUCH_CAP)
      return this.toast(`pouch is full (${this.seeds.length}/${POUCH_CAP}) — ✕ a seed or plant some`)
    const spend = picksCost(b)
    const total = BREED_COST + spend
    if (this.pollen < total) return this.toast(`a cross costs ${BREED_COST}🌼 base — need ${total}🌼`)
    const genome = boardCommit(b)
    if (!genome) return this.toast('set both parents first')
    // crossing spends pollen, never mints it — the bees pay bounties for that
    this.pollen -= total
    const gen = b.childGen
    this.seeds.push({ id: this.seedId++, genome, gen })
    this.stats.bred++
    const ph = phenotype(genome)
    this.toastAt(this.ship.pos, `🌸 ${ph.name} (F${gen})${ph.shiny ? ' ✦' : ''}`, '#ffd257')
    sfx('breed')
    this.board = null
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

  /** where one of OUR guns actually drops its shells: bred reach × battery
   *  elevation. Raider guns always fire at full bred reach. */
  plantRange(p: Plant): number {
    return p.pheno.range * this.elev
  }

  /** pull the lanyard on one mount: fire the plant's gene-gun. Every projectile
   *  behaviour now rides the genome — barrels fan, the reach gene sets the burst
   *  ring, a homing quirk curves the shells, an airburst locus scatters a cluster
   *  where they land. No rig: the phenotype IS the weapon. */
  private firePlant(m: Mount, from: Vec) {
    const p = m.plant!
    p.activeT = 4
    const heading = this.ship.a + p.aim // hull-relative: turning walks the burst
    this.fireVolley(from, heading, p, true, 1, true)
    this.puff(v(from.x, from.y - 16), '#fff3c4', 2)
    if (Math.random() < 0.7) sfx('shoot')
  }

  /** launch a plant's fanned volley of mortar shells from `from` along `heading`.
   *  Each shell bursts at the plant's bred reach; homing/airburst/pierce/leech
   *  all ride along regardless of who's firing — an enemy gun's genome is just
   *  as live as yours. `muzzle` lifts the spawn to the deck; airburst cluster
   *  sub-shells pass muzzle=false so they radiate from the burst point at
   *  ground level. `opts` carries the enemy-only extras: slower shell speed,
   *  the firing ship (patience-on-landed-hit), and the hive-taint flag. */
  private fireVolley(
    from: Vec,
    heading: number,
    p: Plant,
    friendly: boolean,
    dmgScale: number,
    muzzle: boolean,
    opts: { speed?: number; owner?: EnemyShip; bee?: boolean } = {}
  ) {
    const speed = opts.speed ?? 260 // shells hang in the air — lead a moving target
    const homing = p.pheno.quirk === 'homing'
    // the reach gene is the rangefinder; friendly guns fire at the battery
    // elevation, enemy guns at their own (bastion gunners crank theirs in)
    const reach = friendly ? this.plantRange(p) : p.pheno.range * (p.elev ?? 1)
    for (let i = 0; i < p.pheno.shots; i++) {
      const a = heading + (i - (p.pheno.shots - 1) / 2) * p.pheno.spread
      const drop = v(from.x + Math.cos(a) * reach + rand(-7, 7), from.y + Math.sin(a) * reach + rand(-7, 7))
      const pos = muzzle ? v(from.x, from.y - 16) : v(from.x, from.y)
      const flightT = Math.max(0.05, dist(pos, drop) / speed)
      this.bullets.push({
        pos,
        vel: v((drop.x - pos.x) / flightT, (drop.y - pos.y) / flightT),
        dmg: p.pheno.dmg * dmgScale,
        element: p.pheno.element,
        quirk: p.pheno.quirk,
        friendly,
        life: flightT,
        src: p,
        drop,
        flightT,
        splash: this.plantSplash(p),
        homing,
        heading: a,
        airburst: muzzle && p.pheno.airburst, // only the primary shell airbursts
        owner: opts.owner,
        bee: opts.bee,
      })
    }
  }

  /** an airburst shell comes apart over the drop: scatter a short cluster of
   *  sub-shells around the point, each a fraction of the plant's punch. */
  private airburstCluster(p: Plant, at: Vec, friendly: boolean) {
    const n = 3
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(0.6)
      const rr = SPLASH * rand(0.9, 1.7)
      const drop = v(at.x + Math.cos(a) * rr, at.y + Math.sin(a) * rr)
      const pos = v(at.x, at.y)
      const flightT = Math.max(0.05, dist(pos, drop) / 170)
      this.bullets.push({
        pos,
        vel: v((drop.x - pos.x) / flightT, (drop.y - pos.y) / flightT),
        dmg: p.pheno.dmg * 0.45,
        element: p.pheno.element,
        quirk: p.pheno.quirk === 'leech' ? 'leech' : 'none',
        friendly,
        life: flightT,
        src: p,
        drop,
        flightT,
        splash: SPLASH * 0.8,
      })
    }
    this.puff(at, '#ffe08a', 6)
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
    this.mounts = next.mounts.map((md, i) => ({ x: md.x, y: md.y, aim0: md.aim, plant: old[i]?.plant ?? null }))
    this.banner = { title: `${next.name}!`, sub: `${next.mounts.length} gun mounts · hull ${next.hull}`, t: 3 }
    this.burst(this.ship.pos, '#e8c98a', 16)
    this.shake = Math.min(8, this.shake + 3)
    sfx('build')
  }

  // ---- enemies ----

  /** what the deeper sea sends: specialists join the stock raiders as danger climbs */
  private rollKind(danger: number): EnemyShip['kind'] {
    const table: { kind: EnemyShip['kind']; w: number }[] = [
      { kind: 'raider', w: 10 },
      { kind: 'harrier', w: danger > 2 ? Math.min(3.5, danger * 0.4) : 0 },
      { kind: 'sloop', w: danger > 1.5 ? 2.2 : 0 },
      { kind: 'fireship', w: danger > 2.5 ? Math.min(2.5, 0.8 + (danger - 2.5) * 0.5) : 0 },
      { kind: 'galleon', w: danger > 4 ? Math.min(2.2, 0.7 + (danger - 4) * 0.4) : 0 },
      { kind: 'mortar', w: danger > 3.5 ? Math.min(1.8, 0.5 + (danger - 3.5) * 0.35) : 0 },
    ]
    return weighted(table, t => t.w).kind
  }

  spawnEnemyShip(opts: { at?: Vec; kind?: EnemyShip['kind']; home?: POI; dangerBonus?: number } = {}) {
    const c = this.ship.pos
    let pos = opts.at
    if (!pos) {
      const angle = rand(Math.PI * 2)
      const away = rand(650, 1000)
      pos = v(c.x + Math.cos(angle) * away, c.y + Math.sin(angle) * away)
    }
    const danger = this.dangerAt(pos) + (opts.dangerBonus ?? 0)
    const kind = opts.kind ?? this.rollKind(danger)
    const size =
      kind === 'harrier' || kind === 'fireship'
        ? 2
        : kind === 'sloop'
          ? randInt(2, 3)
          : kind === 'mortar'
            ? randInt(3, 4)
            : kind === 'galleon'
              ? randInt(5, Math.min(5 + Math.ceil(danger / 3), 7))
              : kind === 'bastion'
                ? 8
                : randInt(2, Math.min(2 + Math.ceil(danger / 2), 6))
    const r = 20 + size * 6
    // fireship plating deepens with the waters: bare hulls pop to one normal
    // hit, bronze takes two, iron three — the blast is the same either way
    const armor: 0 | 1 | 2 = kind !== 'fireship' ? 0 : danger >= 6.5 ? 2 : danger >= 4 ? 1 : 0
    const maxHp =
      kind === 'harrier'
        ? size * (20 + danger * 3.5)
        : kind === 'sloop'
          ? size * (18 + danger * 3)
          : kind === 'mortar'
            ? size * (28 + danger * 5.5) // tough enough to survive the approach, not a galleon-tank
            : kind === 'galleon'
              ? size * (34 + danger * 6)
              : kind === 'fireship'
                ? FIRESHIP_HIT * (armor + 1)
                : kind === 'bastion'
                  ? size * (42 + danger * 7) // honeycomb walls out-tank any galleon
                  : size * (26 + danger * 5)
    // fireships mount no guns — the hull is the shell
    let gunCount =
      kind === 'harrier'
        ? 1
        : kind === 'fireship'
          ? 0
          : kind === 'sloop'
            ? 1 + (danger >= 5 ? 1 : 0)
            : kind === 'mortar'
              ? 1 + (danger >= 6 ? 1 : 0) // one heavy siege gun; two once the water gets deep
              : kind === 'galleon'
                ? 3 + (size >= 6 ? 1 : 0) + (danger >= 7 ? 1 : 0)
                : kind === 'bastion'
                  ? 4 + (danger >= 6 ? 1 : 0)
                  : 1 + (size >= 4 ? 1 : 0) + (danger >= 6 && size >= 5 ? 1 : 0) + (opts.home ? 1 : 0)
    const guns: EGun[] = []
    // batteries spawn sharing an axis, alternating port/starboard; once hunting,
    // each mount grinds slowly onto you (gunTraverse) while the hull holds range
    const gunA = rand(Math.PI * 2)
    for (let i = 0; i < gunCount; i++) {
      const pa = (i / gunCount) * Math.PI * 2 + rand(0.6)
      const pd = gunCount === 1 ? 0 : r * 0.45
      // enemy guns grow from the same waters — northern raiders shoot frost, and
      // that telegraph is the region system talking
      const genome = wildGenome((opts.home ? 1.6 : 1) + danger * 0.4, this.regionMul(pos))
      // class doctrine bred into the guns: sloops carry long glass, galleons heavy shot
      if (kind === 'sloop') genome.reach = [Math.random() < 0.25 ? 'spyglass' : 'long', 'long']
      if (kind === 'galleon' || kind === 'mortar') {
        // titan is region-locked: only ships raiding titan waters mount the real thing
        const titanHere = this.inRegion(pos, regionLockOf('power', 'titan')!)
        genome.power = [titanHere && Math.random() < 0.25 ? 'titan' : 'stout', 'stout']
      }
      if (kind === 'mortar') {
        // a siege gun is built to reach: long glass, same doctrine as a sloop's,
        // but bolted to a hull that digs in and ranges you instead of fleeing
        genome.reach = [Math.random() < 0.3 ? 'spyglass' : 'long', 'long']
      }
      if (kind === 'bastion') {
        // the bees breed their own guns, and they breed them well: long glass,
        // heavy shot — region locks don't bind the swarm's own garden
        genome.reach = [Math.random() < 0.5 ? 'spyglass' : 'long', 'long']
        genome.power = [Math.random() < 0.4 ? 'titan' : 'stout', 'stout']
      }
      const plant = makePlant(genome, 0)
      plant.aim = gunA + (i % 2) * Math.PI + rand(-0.15, 0.15)
      guns.push({ x: Math.cos(pa) * pd, y: Math.sin(pa) * pd, plant })
    }
    const patience0 =
      kind === 'sloop'
        ? 16
        : kind === 'galleon'
          ? 20
          : kind === 'mortar'
            ? 25 // a dug-in gunner doesn't spook easy
            : kind === 'fireship'
              ? 45
              : kind === 'bastion'
                ? 40
                : CHASE_PATIENCE
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
      speed:
        kind === 'bastion'
          ? 0 // the island does not chase
          : 1.25 *
            (kind === 'harrier'
              ? 92 + Math.min(18, danger * 2.5)
              : kind === 'fireship'
                ? 100 + Math.min(25, danger * 3)
                : kind === 'sloop'
                  ? Math.min(88, 55 + danger * 3)
                  : kind === 'mortar'
                    ? Math.min(42, 24 + danger * 1.3) // slow to reposition — close on it and it stays closed on
                    : kind === 'galleon'
                      ? Math.min(46, 30 + danger * 1.5)
                      : Math.min(80, 40 + danger * 3 + rand(10))),
      mode: 'roam',
      noticeT: 0,
      noticeD: 0,
      aggroR:
        kind === 'harrier'
          ? 380
          : kind === 'sloop' || kind === 'mortar'
            ? 430
            : kind === 'fireship'
              ? 400
              : kind === 'bastion'
                ? 640
                : AGGRO_R,
      deaggroR: baseDeaggro(kind),
      wanderA: rand(Math.PI * 2),
      wanderT: rand(2, 6),
      patience: patience0,
      patience0,
      reactT: rand(0.35, 0.7),
      row: 1,
      danger,
      kind,
      armor,
      home: opts.home,
      // some crews aren't dumb: sloops always shy off hive guns, fireships never
      // (the crew is already dead), the rest split roughly half and half
      wary: kind === 'sloop' ? true : kind === 'fireship' || kind === 'bastion' ? false : Math.random() < 0.45,
      // jumpy crews get more common the deeper you push — rougher waters breed
      // sloops that won't give a brawler a fair fight even at full health
      riskAverse: kind === 'sloop' && Math.random() < clamp(0.2 + danger * 0.07, 0.2, 0.85),
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
    // a garrison at peace ignores the player entirely — its guns are for raiders
    if (e.kind === 'bastion' && !this.beesAngry && !e.home?.hostile) return
    e.mode = 'notice'
    // the eager classes commit fast: rowers smell blood, fireships exist to burn
    e.noticeT = e.kind === 'harrier' || e.kind === 'fireship' ? t * 0.6 : t
    e.noticeD = dist(e.pos, this.ship.pos)
    this.toastAt(e.pos, '❓', '#ffd257')
    sfx('notice')
  }

  aggro(e: EnemyShip) {
    if (e.mode === 'hunt') return
    e.mode = 'hunt'
    e.patience = e.patience0
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
      // a fortress garrison fights outside the pack's slot discipline — it
      // neither waits for a slot nor denies one to the ships that must sail
      if (e.kind === 'bastion') {
        e.engaged = e.mode === 'hunt'
        continue
      }
      if (e.mode !== 'hunt') e.engaged = false
      else if (e.engaged) slots++
    }
    if (slots < HUNT_CAP) {
      const shadowers = this.enemies
        .filter(e => e.kind !== 'bastion' && e.mode === 'hunt' && !e.engaged)
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
      // chasers lead your course — but from the lookout's slightly stale picture
      // (reactT back), so they anticipate held courses yet lag your jinks instead
      // of mirroring the helm frame-for-frame
      const past = this.shipAt(e.reactT)
      const leadT = Math.min(2.2, d / Math.max(60, spd)) + e.reactT
      const lead = v(past.x + past.vx * leadT, past.y + past.vy * leadT)

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

      if (e.mode === 'hunt' && e.kind === 'fireship') {
        // the fireship IS the shell: charge the intercept point flat out and burn
        // together on contact. Its flame wake says where it's pointed — turn away
        const lx = lead.x - e.pos.x
        const ly = lead.y - e.pos.y
        const ld = Math.hypot(lx, ly) || 1
        e.vel.x = (lx / ld) * spd
        e.vel.y = (ly / ld) * spd
        if (Math.random() < 9 * dt) {
          this.puff(v(e.pos.x + rand(-e.r * 0.5, e.r * 0.5), e.pos.y + rand(-e.r * 0.5, e.r * 0.5)), '#ff8c42', 1)
        }
        if (this.onHull(e.pos, e.r * 0.7)) {
          this.fireshipBlast(e)
          continue
        }
      } else if (
        e.mode === 'hunt' &&
        e.kind === 'sloop' &&
        d < this.sloopStandoff(e) &&
        (e.riskAverse || e.hp < e.maxHp * SLOOP_BOLD_FLEE_HP)
      ) {
        // a risk-averse sloop refuses the brawl outright; a bold one only
        // sheets away once it's actually hurt — close inside its glass and it
        // curves off to re-open the range — chase it down or let it go.
        // Either way, running scared (not trading shots) burns patience fast:
        // a sloop that kites the whole fight eventually gives up on its own
        e.vel.x = -ux * spd - uy * e.orbitDir * spd * 0.3
        e.vel.y = -uy * spd + ux * e.orbitDir * spd * 0.3
        e.patience -= dt * (SLOOP_KITE_PATIENCE_MULT - 1)
      } else if (e.mode === 'hunt') {
        // sail for the station where the cheapest battery's burst ring will land
        // on you — computed against your led course, so runners get cut off
        const gun = this.bestGun(e, lead, e.engaged ?? false)
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
      // every class under canvas feels the wind and the dead pools — less than
      // your square rig; harrier oars and the fireship's doomed crew don't care
      if (e.kind !== 'harrier' && e.kind !== 'fireship') {
        if (e.mode === 'hunt') {
          const wEff = 0.8 + 0.2 * ((1 + Math.cos(angleDiff(Math.atan2(e.vel.y, e.vel.x), this.wind.a))) / 2)
          e.vel.x *= wEff
          e.vel.y *= wEff
        }
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
        // a fully patched hull shakes off the bee sting — its salvage is clean again
        if (e.beeHit && e.hp >= e.maxHp) e.beeHit = false
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
      // the wary crews sheer away from hive artillery rather than sail the band:
      // a soft shoulder from far out, and a hard refusal to enter the guns' reach
      if (e.wary) {
        for (const p of this.activePois) {
          if (p.kind !== 'hive' || p.done) continue
          const hx = e.pos.x - p.pos.x
          const hy = e.pos.y - p.pos.y
          const hd = Math.hypot(hx, hy)
          if (hd > 1 && hd < 700) {
            const push = ((700 - hd) / 700) * Math.max(spd, 40) * 2.2
            e.vel.x += (hx / hd) * push
            e.vel.y += (hy / hd) * push
            // inside the band itself, survival overrides the hunt: bail straight out
            if (hd < 500) {
              e.vel.x = (hx / hd) * Math.max(spd, 60)
              e.vel.y = (hy / hd) * Math.max(spd, 60)
            }
          }
        }
      }
      // whatever the steering above decided, a fortress stays a fortress
      if (e.kind === 'bastion') {
        e.vel.x = 0
        e.vel.y = 0
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
        // a hunting mount grinds toward you while the hull holds range — slow
        // enough that keeping way on still slips the ring, but a ship you circle
        // is no longer helpless. Roamers don't track: sneaking past stays a play
        if (e.kind === 'bastion') {
          // bee gunners pick their own fights: any raider in reach comes first,
          // the player only once the hive is crossed
          const maxR = p.pheno.range
          const minR = maxR * 0.5
          let prey: EnemyShip | null = null
          let pd = maxR + 140
          for (const o of this.enemies) {
            if (o === e || o.sunk || o.kind === 'bastion') continue
            const od = dist(from, o.pos)
            if (od < pd) {
              pd = od
              prey = o
            }
          }
          const atWar = e.mode === 'hunt' && !this.over
          let want: Vec | null = null
          if (prey) {
            want = this.leadIntercept(from, prey.pos, prey.vel, minR, maxR)
          } else if (atWar) {
            want = v(past.x, past.y)
          }
          this.rangeInFire(
            e,
            p,
            from,
            want,
            drop => (prey ? dist(drop, want!) < prey.r + SPLASH * 0.5 : this.onHull(drop, SPLASH * 0.5)),
            dt
          )
          continue
        }
        if (e.kind === 'mortar') {
          // a siege gun doesn't stand and hope, or flee and hope: it RANGES YOU
          // IN for real — cranking elevation walks the reticule short of full
          // reach, and it leads your course to where the shell will actually
          // land. Only ever targets you, and only once it's got a slot
          const maxR = p.pheno.range
          const minR = maxR * 0.5
          const atWar = e.mode === 'hunt' && e.engaged && !this.over
          const want = atWar ? this.leadIntercept(from, this.ship.pos, this.ship.vel, minR, maxR) : null
          this.rangeInFire(e, p, from, want, drop => this.onHull(drop, SPLASH * 0.5), dt)
          continue
        }
        if (e.mode === 'hunt' && !this.over) {
          // gunners work off the same stale picture as the helm — the rings
          // chase where you were, not the stick in your hand
          const want = Math.atan2(past.y - from.y, past.x - from.x)
          const tr = gunTraverse(e.kind) * dt
          p.aim += clamp(angleDiff(want, p.aim), -tr, tr)
        }
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

  /** fixed-point converge a shell's flight time against a moving target's
   *  intercept point — flight time depends on the drop distance, which
   *  depends on the intercept point, so a few rounds converge the two.
   *  Shared by anything that RANGES IN instead of firing dumb along its aim */
  private leadIntercept(from: Vec, targetPos: Vec, targetVel: Vec, minR: number, maxR: number): Vec {
    let ft = clamp(dist(from, targetPos), minR, maxR) / 200
    let want = targetPos
    for (let it = 0; it < 3; it++) {
      want = v(targetPos.x + targetVel.x * ft, targetPos.y + targetVel.y * ft)
      ft = clamp(dist(from, want), minR, maxR) / 200
    }
    return want
  }

  /** crank elevation and traverse toward `want`, firing once the drop point
   *  actually covers it (per the caller's `covers` test) — the doctrine
   *  bastions and mortars share instead of holding a fixed reach and firing
   *  dumb along whatever the aim happens to already be pointed */
  private rangeInFire(e: EnemyShip, p: Plant, from: Vec, want: Vec | null, covers: (drop: Vec) => boolean, dt: number) {
    const maxR = p.pheno.range
    if (want) {
      const wantA = Math.atan2(want.y - from.y, want.x - from.x)
      const tr = gunTraverse(e.kind) * dt
      p.aim += clamp(angleDiff(wantA, p.aim), -tr, tr)
      const wantE = clamp(dist(from, want) / maxR, 0.5, 1)
      const cur = p.elev ?? 1
      p.elev = cur + clamp(wantE - cur, -ELEV_RATE * dt, ELEV_RATE * dt)
    }
    if (p.cooldown <= 0 && want) {
      const dropR = maxR * (p.elev ?? 1)
      const drop = v(from.x + Math.cos(p.aim) * dropR, from.y + Math.sin(p.aim) * dropR)
      if (covers(drop)) {
        this.enemyFire(e, p, from)
        p.cooldown = p.pheno.period * 1.1 * (e.chillT > 0 ? 1.5 : 1) * rand(0.9, 1.15)
      }
    }
  }

  /** the range a sloop refuses to fight inside — well under its longest glass,
   *  with hysteresis against its stationing distance so it doesn't dither */
  private sloopStandoff(e: EnemyShip): number {
    let reach = 300
    for (const g of e.guns) reach = Math.max(reach, g.plant.pheno.range)
    return reach * 0.62
  }

  /** contact: the fireship goes up against your hull — blast, flames, gone.
   *  No loot; everything it carried is burning with it. */
  private fireshipBlast(e: EnemyShip) {
    if (e.sunk) return
    e.sunk = true
    this.ship.hp -= 24 + e.danger * 5
    this.burnT = Math.max(this.burnT, 5)
    // flames wash over the nearby mounts too
    for (const m of this.mounts) {
      const p = m.plant
      if (p && dist(e.pos, this.mountPos(m)) < e.r + 55) p.burnT = 4
    }
    this.burst(e.pos, '#ff8c42', 24)
    this.burst(e.pos, '#ffd257', 10)
    this.shake = Math.min(14, this.shake + 8)
    this.toastAt(e.pos, '🔥 fireship!', '#ff9d5c')
    sfx('sunk')
    if (this.ship.hp <= 0) this.gameOver()
  }

  /** give up the chase and wander off to lick wounds — the way out of a hunt */
  private breakOff(e: EnemyShip, ux: number, uy: number, msg: string) {
    e.mode = 'roam'
    e.engaged = false
    e.deaggroR = baseDeaggro(e.kind) // shed any pod-wake stretch
    e.wanderT = rand(3, 8)
    e.wanderA = Math.atan2(-uy, -ux) // sail off, unhurried, patching up
    this.toastAt(e.pos, msg, '#9fb8c8')
  }

  /** the gun whose firing station costs the least sailing — fixed mortars can't
   *  traverse, so the ship picks the battery whose burst ring is cheapest to walk
   *  onto you: engaged hunters station at that gun's bred reach (a spyglass line
   *  is a proper artillery ship), shadowers hold off at 430. A bold sloop is the
   *  one exception: "stands and fights" only means something if the range it
   *  fights at is one you can actually close — so it holds a brawling distance,
   *  not the full glass a risk-averse sloop keeps you at */
  private bestGun(e: EnemyShip, center: Vec, engaged: boolean): { p: Plant; fp: Vec } | null {
    let best: { p: Plant; fp: Vec; d: number } | null = null
    for (const g of e.guns) {
      const p = g.plant
      const standoff = !engaged
        ? 430
        : e.kind === 'sloop' && !e.riskAverse
          ? Math.min(p.pheno.range, SLOOP_BOLD_STATION)
          : p.pheno.range
      const fp = v(center.x - Math.cos(p.aim) * standoff - g.x, center.y - Math.sin(p.aim) * standoff - g.y)
      const d = dist(e.pos, fp)
      if (!best || d < best.d) best = { p, fp, d }
    }
    return best
  }

  private enemyFire(e: EnemyShip, p: Plant, from: Vec) {
    // the mount lobs along its current heading, bursting at the bred reach
    // (scaled by elevation on fortress guns) — the bred quirk/barrel/burst ride
    // along too, same machinery as your own guns: a raider can homing-snipe you
    // or airburst a cluster same as you can on them
    // bee fortress gunners are drilled steady; ship crews throw looser shots
    const jitter = e.kind === 'bastion' ? 0.015 : 0.05
    const a = p.aim + rand(-jitter, jitter)
    this.fireVolley(from, a, p, false, 0.75 + e.danger * 0.06, true, {
      speed: 200, // slower shells than yours — keep way on and slip the drop
      owner: e,
      bee: e.kind === 'bastion',
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
    // loot scales a touch faster than the threat — pushing one ring out is always
    // tempting. But a bee-stung hull is the swarm's kill: it pays nothing
    if (!e.beeHit) {
      let wood = e.size * randInt(2, 3) + Math.floor(e.danger * 0.8)
      while (wood > 0) {
        const n = Math.min(wood, randInt(2, 4))
        this.dropLoot('wood', n, scatter())
        wood -= n
      }
      if (Math.random() < 0.6) this.dropLoot('water', 1 + Math.floor(e.danger / 6), scatter())
    }
    this.stats.sunk++
    this.shake = Math.min(10, this.shake + 5)
    this.burst(e.pos, '#8a6a45', 16)
    this.toastAt(e.pos, e.beeHit ? '☠ bee-stung — no salvage' : '☠ ship sunk!', e.beeHit ? '#9fb8c8' : '#ffd257')
    sfx('sunk')
    // the bee bounty pays for raider hulls — the swarm's own garrison doesn't
    // count, and neither does a kill the bees softened up
    if (this.contract && e.kind !== 'bastion' && !e.beeHit) {
      const c = this.contract
      c.got++
      if (c.got >= c.need) {
        this.pollen += c.pay
        c.hive.bounties++ // repeat business — this hive asks steeper next time
        this.contract = null
        this.banner = { title: '🐝 bounty fulfilled', sub: `the bees pay ${c.pay}🌼 pollen`, t: 3.5 }
        sfx('breed')
      } else {
        this.toastAt(e.pos, `🐝 ${c.got}/${c.need}`, '#ffd257')
      }
    }
    if (e.home && !this.enemies.some(o => o !== e && o.home === e.home && !o.sunk)) {
      if (e.home.kind === 'hive') this.hiveFallen(e.home)
      else this.nestCleared(e.home)
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
    if (e.beeHit) return // a stung ship's lines go down with it — the bees' claim
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
      // homing: a friendly shell curves toward the nearest raider in flight,
      // an enemy one curves toward you — either way it bursts the moment it
      // reaches its mark
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
          this.steerHoming(b, best.pos, dt)
          if (bd < best.r + 14) b.life = 0
        }
      } else if (b.homing && !b.friendly) {
        const d = this.steerHoming(b, this.ship.pos, dt)
        if (d < this.tierDef().len * 0.7) b.life = 0
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

  /** bend a homing shell's flight toward `target`, redrawing its drop point to
   *  match — returns the current distance so the caller can decide when it's
   *  close enough to detonate early */
  private steerHoming(b: Bullet, target: Vec, dt: number): number {
    const speed = Math.hypot(b.vel.x, b.vel.y) || 1
    const cur = Math.atan2(b.vel.y, b.vel.x)
    const want = Math.atan2(target.y - b.pos.y, target.x - b.pos.x)
    const na = cur + clamp(angleDiff(want, cur), -3.2 * dt, 3.2 * dt)
    b.vel.x = Math.cos(na) * speed
    b.vel.y = Math.sin(na) * speed
    b.drop = v(b.pos.x + b.vel.x * b.life, b.pos.y + b.vel.y * b.life)
    return dist(b.pos, target)
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
          if (b.owner && !b.owner.sunk) b.owner.patience = b.owner.patience0 // a burst that tells keeps them keen
          p.hp -= b.dmg * (b.element === 'venom' ? 1.6 : 1)
          if (b.element === 'ember') p.burnT = 3
          if (b.element === 'frost') this.chillT = 2.5
          if (b.element === 'venom') p.poisonT = 4
          // a hit flower shreds leaves right at the mount, on top of the
          // generic spark burst below — that's the tell for "that one got hit"
          // versus a shell that only rattled the hull
          for (let i = 0; i < 7; i++) this.shedLeaf(this.mountPos(m))
          // a leech-bred enemy gun drinks off its own hit same as yours would
          if (b.quirk === 'leech' && b.src) this.leechProc(b.src, at)
        }
      }
      if (this.onHull(at, splash * 0.5)) {
        hitAny = true
        if (b.owner && !b.owner.sunk) b.owner.patience = b.owner.patience0 // a burst that tells keeps them keen
        this.ship.hp -= b.dmg
        if (b.element === 'ember') this.burnT = 3
        if (b.element === 'frost') this.chillT = 2.5
        this.shake = Math.min(8, this.shake + 1.5)
        if (this.ship.hp <= 0) this.gameOver()
        if (b.quirk === 'leech' && b.src) this.leechProc(b.src, at)
      }
      // hive artillery hits raider hulls AND their mounted guns too — a stung
      // ship pays no salvage until its crew fully patches up (the bees claim
      // tainted kills)
      if (b.bee) {
        for (const o of this.enemies) {
          if (o.sunk || o.kind === 'bastion') continue
          for (const eg of [...o.guns]) {
            const gp = eg.plant
            if (dist(at, this.gunPos(o, eg)) < splash) {
              hitAny = true
              o.beeHit = true
              gp.hp -= b.dmg * (b.element === 'venom' ? 1.6 : 1)
              if (b.element === 'ember') gp.burnT = 3
              if (b.element === 'frost') o.chillT = 2.5
              if (b.element === 'venom') gp.poisonT = 4
              for (let i = 0; i < 7; i++) this.shedLeaf(this.gunPos(o, eg))
              if (gp.hp <= 0) {
                this.killEnemyGun(o, eg)
                this.checkScuttle(o)
              }
            }
          }
          if (!o.sunk && dist(at, o.pos) < o.r + splash * 0.5) {
            hitAny = true
            o.beeHit = true
            this.damageEnemyHull(o, b)
          }
        }
      }
      if (hitAny) {
        this.burst(at, this.bulletColor(b), 10)
        sfx('hit')
      } else {
        this.puff(at, '#bfe3f2', 5)
      }
      // airburst locus: same as yours, the shell comes apart and scatters a
      // cluster of sub-shells at the drop point
      if (b.airburst && b.src) this.airburstCluster(b.src, at, false)
      return
    }
    for (const e of this.enemies) {
      if (e.sunk) continue
      for (const g of [...e.guns]) {
        const p = g.plant
        if (dist(at, this.gunPos(e, g)) < splash) {
          hitAny = true
          this.aggro(e)
          e.patience = e.patience0 // you drew blood — now they're invested
          p.hp -= b.dmg * (b.element === 'venom' ? 1.6 : 1)
          if (b.element === 'ember') p.burnT = 3
          if (b.element === 'frost') e.chillT = 2.5
          if (b.element === 'venom') p.poisonT = 4
          if (b.quirk === 'leech' && b.src) this.leechProc(b.src, at)
          // same "that flower got hit" tell as your own mounts, right on their gun
          for (let i = 0; i < 7; i++) this.shedLeaf(this.gunPos(e, g))
          if (p.hp <= 0) {
            this.killEnemyGun(e, g)
            this.checkScuttle(e)
          }
        }
      }
      if (!e.sunk && dist(at, e.pos) < e.r + splash * 0.5) {
        hitAny = true
        this.aggro(e)
        e.patience = e.patience0 // you drew blood — now they're invested
        this.damageEnemyHull(e, b)
        if (b.quirk === 'leech' && b.src) this.leechProc(b.src, at)
      }
    }
    // a shell over a hive island wakes the swarm — the first burst provokes,
    // every one after lands on the garrison like any other hull
    for (const p of this.activePois) {
      if (p.kind === 'hive' && !p.done && dist(at, p.pos) < p.r + splash * 0.5) {
        hitAny = true
        this.provokeHive(p)
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
    // airburst locus: the shell comes apart and scatters a cluster where it bursts
    if (b.airburst && b.src) this.airburstCluster(b.src, at, b.friendly)
  }

  /** the leech quirk pays off: siphoned droplets stream from the burst back to
   *  the plant — the visible "drink" — as it patches its own stem */
  private leechProc(src: Plant, from: Vec) {
    src.hp = Math.min(src.maxHp, src.hp + 2)
    const m = this.mounts.find(mm => mm.plant === src)
    if (!m) return
    const to = this.mountPos(m)
    for (let i = 0; i < 6; i++) {
      const jx = rand(-14, 14)
      const jy = rand(-14, 14)
      const flight = rand(0.35, 0.55)
      this.particles.push({
        pos: v(from.x + jx, from.y + jy),
        // aim past the plant a touch — updateFx damps velocity in flight
        vel: v(((to.x - from.x - jx) / flight) * 1.3, ((to.y - from.y - jy) / flight) * 1.3),
        life: flight,
        maxLife: flight,
        size: rand(1.5, 2.8),
        color: '#8ef0b0',
      })
    }
    if (this.time - this.leechToastT > 0.9) {
      this.leechToastT = this.time
      this.toastAt(to, '+♥', '#8ef0b0')
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
      Math.random() < 0.75
        ? { kind: 'wood', n: randInt(2, 3), seed: undefined, pos, vel, ttl: 70, phase: rand(6) }
        : { kind: 'water', n: 1, seed: undefined, pos, vel, ttl: 70, phase: rand(6) }
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
      case 'pollen':
        this.pollen += l.n
        this.toastAt(l.pos, `+${l.n}🌼`, '#ffd257')
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
    if (this.board) {
      this.boardClick(mx, my)
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
    if (this.paused) return
    this.worldClick(this.screenToWorld(mx, my))
  }

  /** route a click on the open channeling board to its hit targets */
  private boardClick(mx: number, my: number) {
    const b = this.board!
    const hit = boardLayout(this.vw, this.vh, b).hitTest(mx, my)
    if (!hit) return
    switch (hit.kind) {
      case 'cancel':
        this.board = null
        sfx('deny')
        return
      case 'auto':
        boardAuto(b)
        return
      case 'cross':
        this.commitBoard()
        return
      case 'focus':
        boardFocus(b, hit.slot)
        return
      case 'stock':
        boardChoose(b, hit.idx)
        return
      case 'del': {
        const entry = b.stock[hit.idx]
        if (!entry || entry.seedId === undefined) return
        const i = this.seeds.findIndex(s => s.id === entry.seedId)
        if (i >= 0) this.seeds.splice(i, 1)
        this.seedSel = Math.min(this.seedSel, Math.max(0, this.seeds.length - 1))
        this.seedScroll = Math.min(this.seedScroll, Math.max(0, this.seeds.length - SEED_VISIBLE))
        boardRemoveStock(b, hit.idx)
        this.boardMsg = { text: `🗑 ${entry.name} overboard (${this.seeds.length}/${POUCH_CAP})`, t: 2.4, color: '#e8c98a' }
        sfx('break')
        return
      }
      case 'allele':
        if (!boardPlace(b, hit.locus, hit.slot, hit.allele)) {
          this.boardMsg = { text: 'not enough pollen 🌼 for that rare', t: 2.4, color: '#ffb3b3' }
          sfx('deny')
        }
        return
    }
  }

  wheel(dir: number) {
    if (this.board) {
      this.board.scroll = clamp(this.board.scroll + dir, 0, 99)
      return
    }
    if (this.tool === 'plant') {
      this.seedScroll = clamp(this.seedScroll + dir, 0, Math.max(0, this.seeds.length - SEED_VISIBLE))
    }
  }

  keydown(code: string) {
    // the channeling board owns the keyboard while it's open
    if (this.board) {
      if (code === 'Escape') {
        this.board = null
        sfx('deny')
      } else if (code === 'Enter') {
        this.commitBoard()
      } else if (code === 'KeyF') {
        boardAuto(this.board)
      }
      return
    }
    const idx = ['Digit1', 'Digit2'].indexOf(code)
    if (idx >= 0 && idx < TOOLS.length) {
      this.tool = TOOLS[idx].tool
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
      case 'KeyF':
        this.tryDock()
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
    if (this.board) this.boardMsg = { text, t: 2.4, color: '#ffb3b3' }
    else this.toastAt(this.hover, text, '#ffb3b3')
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
          // occupied — a second click on the SAME mount confirms the dig, so
          // one stray click can't destroy a plant you meant to keep
          if (this.pendingDig === m) {
            m.plant = null
            this.toastAt(this.mountPos(m), 'dug up 🥀', '#c5b8a0')
            this.pendingDig = null
          } else {
            this.pendingDig = m
            this.pendingDigT = 1.4
            this.toastAt(this.mountPos(m), 'click again to dig up', '#ff9d5c')
          }
          return
        }
        this.pendingDig = null
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

  /** a burst of leaves marks the instant a plant takes a hit — ongoing wound
   *  state is the sprite's own pose/color (drawPlant), not a particle trickle */
  private shedLeaf(at: Vec) {
    this.particles.push({
      pos: v(at.x + rand(-7, 7), at.y - rand(10, 24)),
      vel: v(rand(-18, 18), rand(10, 26)),
      life: rand(0.8, 1.3),
      maxLife: 1.3,
      size: rand(1.8, 3),
      color: pick(['#7aa05a', '#9b8b62', '#b3a06a']),
    })
  }

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
