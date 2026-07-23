import { EncounterKind, EncounterRole, EnemyShip, Game } from './game'
import { dist, v } from './util'

export interface FormationShipSnapshot {
  kind: EnemyShip['kind']
  role: EncounterRole | null
  mode: EnemyShip['mode']
  engaged: boolean
  reserve: number
  hp: number
  x: number
  y: number
  speed: number
}

export interface FormationCheck {
  name: string
  pass: boolean
  detail: string
}

export interface FormationReport {
  kind: EncounterKind
  pass: boolean
  checks: FormationCheck[]
  ships: FormationShipSnapshot[]
}

const KINDS: EncounterKind[] = ['convoy', 'pincer', 'bombardment', 'fireship-raid', 'patrol', 'broken-fleet']

/** Console-facing harness over the real encounter constructor and enemy update. */
export function createFormationDebug(game: Game) {
  let fleet: EnemyShip[] = []
  let kind: EncounterKind = 'convoy'

  const snapshot = (): FormationShipSnapshot[] => fleet.map(e => ({
    kind: e.kind,
    role: e.encounterRole ?? null,
    mode: e.mode,
    engaged: !!e.engaged,
    reserve: e.reserveT ?? 0,
    hp: Math.round(e.hp * 10) / 10,
    x: Math.round(e.pos.x * 10) / 10,
    y: Math.round(e.pos.y * 10) / 10,
    speed: Math.round(Math.hypot(e.vel.x, e.vel.y) * 10) / 10,
  }))

  const setup = (next: EncounterKind, opts: { danger?: number; heading?: number } = {}) => {
    kind = next
    game.enemies = []
    game.bullets = []
    game.loot = []
    game.ship.pos = v((opts.danger ?? 7) * 550, 0)
    game.ship.vel = v(0, 0)
    game.ship.hp = game.tierDef().hull
    game.over = false
    game.paused = false
    game.helpOpen = false
    const anchor = v(game.ship.pos.x + 800, game.ship.pos.y)
    fleet = game.spawnEncounter({ kind, anchor, heading: opts.heading ?? Math.PI / 2 })
    return snapshot()
  }

  const step = (seconds: number, dt = 1 / 60) => {
    for (let left = Math.max(0, seconds); left > 0;) {
      const tick = Math.min(dt, left)
      game.debugStepEnemies(tick)
      left -= tick
    }
    return snapshot()
  }

  const engage = (role?: EncounterRole) => {
    const target = fleet.find(e => (role ? e.encounterRole === role : (e.reserveT ?? 0) <= 0))
    if (!target) throw new Error(`no available ${role ?? 'front-line'} ship`)
    game.aggro(target)
    return snapshot()
  }

  const verify = (next: EncounterKind = kind): FormationReport => {
    setup(next)
    const checks: FormationCheck[] = []
    const check = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail })
    const roles = fleet.map(e => e.encounterRole)
    check('authored metadata', fleet.every(e => e.encounterKind === next && e.encounterId != null && e.formation), roles.join(', '))
    check('spawn geometry', fleet.every(e => e.formation && dist(e.pos, v(4650 - Math.sin(Math.PI / 2) * e.formation.y, Math.cos(Math.PI / 2) * e.formation.y + e.formation.x)) < 0.01), 'ships begin at their authored offsets')

    if (next === 'convoy') {
      const anchor = fleet.find(e => e.encounterRole === 'anchor')!
      const escorts = fleet.filter(e => e.encounterRole === 'escort')
      step(3)
      const h = anchor.encounterHeading!
      const errors = escorts.map(e => {
        const forward = e.formation!.x - anchor.formation!.x
        const side = e.formation!.y - anchor.formation!.y
        const target = v(anchor.pos.x + Math.cos(h) * forward - Math.sin(h) * side, anchor.pos.y + Math.sin(h) * forward + Math.cos(h) * side)
        return dist(e.pos, target)
      })
      check('convoy retains formation', errors.every(error => error < 55), `escort errors ${errors.map(n => Math.round(n)).join(', ')}px after 3s`)
    }

    const delayed = fleet.filter(e => (e.reserveT ?? 0) > 0)
    if (delayed.length) {
      const before = delayed.map(e => e.reserveT!)
      step(0.5)
      check('reserves stay dormant', delayed.every((e, i) => e.mode === 'roam' && Math.abs(e.reserveT! - before[i]) < 0.001), 'countdown waits for encounter wake')
    }
    engage()
    step(0.1)
    check('pod wake', fleet.filter(e => (e.reserveT ?? 0) <= 0).every(e => e.mode !== 'roam'), 'active podmates notice together')

    if (delayed.length && next !== 'broken-fleet') {
      step(Math.max(...delayed.map(e => e.reserveT ?? 0)) + 0.1)
      check('timed entrance', delayed.every(e => e.mode !== 'roam' && (e.reserveT ?? 0) === 0), 'reserves enter after their telegraph')
    }
    if (next === 'convoy') {
      const anchor = fleet.find(e => e.encounterRole === 'anchor')!
      check('distinct broadside prize', anchor.kind === 'broadside' && anchor.guns.length === 4, 'deep-water convoy carries two guns per side')
      game.aggro(anchor)
      game.debugStepEnemies(0.05)
      const h = anchor.encounterHeading!
      const along = anchor.vel.x * Math.cos(h) + anchor.vel.y * Math.sin(h)
      const across = Math.abs(anchor.vel.x * -Math.sin(h) + anchor.vel.y * Math.cos(h))
      check('convoy holds course', along > 0 && across < along * 0.15, 'anchor follows the authored heading')
      const escorts = fleet.filter(e => e.encounterRole === 'escort')
      check('convoy grouped tightly', escorts.every(e => dist(e.pos, anchor.pos) < 150), 'escorts begin within 150px of the prize')
      // Put the player squarely off the port battery and exercise the real
      // direct projectile path independently of the ambient simulation.
      game.ship.pos = v(anchor.pos.x - 350, anchor.pos.y)
      game.bullets = []
      game.debugStepEnemies(0.05)
      const cannonballs = game.bullets.filter(b => b.direct)
      check('broadside fires direct', cannonballs.length === 2, `${cannonballs.length} port cannonballs, no mortar arcs`)
      const hp = game.ship.hp
      for (let i = 0; i < 50; i++) game.debugStepBullets(1 / 60)
      check('cannon crosses hull', game.ship.hp < hp, `${Math.round((hp - game.ship.hp) * 10) / 10} hull damage`)
    }
    if (next === 'broken-fleet') {
      const runner = fleet.find(e => e.encounterRole === 'fleeing')!
      const reinforcement = fleet.find(e => e.encounterRole === 'reinforcement')!
      runner.pos = v(runner.rally!.x + 10, runner.rally!.y)
      game.aggro(runner)
      game.debugStepEnemies(0.05)
      check('rally wakes reinforcement', (reinforcement.reserveT ?? 1) === 0, 'runner reaching rally cancels reserve delay')
      check('runner joins screen', runner.encounterRole === 'screen' && runner.rally == null, 'runner stops circling the rally point')
    }
    return { kind: next, pass: checks.every(c => c.pass), checks, ships: snapshot() }
  }

  return {
    kinds: KINDS,
    setup,
    engage,
    step,
    snapshot,
    verify,
    verifyAll: () => KINDS.map(k => verify(k)),
  }
}

export type FormationDebug = ReturnType<typeof createFormationDebug>
