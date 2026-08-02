import { EncounterKind, EncounterRole, EnemyShip, Game, onHiveIsland } from './game'
import { makePOI } from './poi'
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

    if (next === 'pincer') {
      const screen = fleet.find(e => e.encounterRole === 'screen')!
      const wings = fleet.filter(e => e.encounterRole === 'flank')
      check('one visible contact', !!screen && wings.length === 2, `screen plus ${wings.length} delayed wings`)
      check(
        'wings begin beyond the screen',
        wings.every(e => dist(e.pos, game.ship.pos) > 1000) && dist(wings[0].pos, wings[1].pos) > 1300,
        `${wings.map(e => Math.round(dist(e.pos, game.ship.pos))).join('m, ')}m from player · ${Math.round(dist(wings[0].pos, wings[1].pos))}m apart`,
      )
    }

    if (next === 'bombardment') {
      const artillery = fleet.find(e => e.encounterRole === 'artillery')!
      const screens = fleet.filter(e => e.encounterRole === 'screen')
      const screenRange = screens.map(e => dist(e.pos, game.ship.pos))
      check(
        'screen guards the gun line',
        screens.length === 2 && screenRange.every(range => range < dist(artillery.pos, game.ship.pos)),
        `screens at ${screenRange.map(Math.round).join('m, ')}m · artillery at ${Math.round(dist(artillery.pos, game.ship.pos))}m`,
      )
      check('screen has a navigable edge', dist(screens[0].pos, screens[1].pos) > 550, `${Math.round(dist(screens[0].pos, screens[1].pos))}m wide`)
    }

    if (next === 'fireship-raid') {
      const fireship = fleet.find(e => e.kind === 'fireship')!
      const screens = fleet.filter(e => e.encounterRole === 'screen')
      check(
        'fireship waits beyond its escorts',
        screens.every(e => dist(e.pos, game.ship.pos) < dist(fireship.pos, game.ship.pos)) && dist(fireship.pos, game.ship.pos) > 1400,
        `escorts at ${screens.map(e => Math.round(dist(e.pos, game.ship.pos))).join('m, ')}m · fireship at ${Math.round(dist(fireship.pos, game.ship.pos))}m`,
      )
    }

    if (next === 'patrol') {
      let span = 0
      for (const a of fleet) for (const b of fleet) span = Math.max(span, dist(a.pos, b.pos))
      check('patrol bars a wide lane', span > 600, `${Math.round(span)}m end to end`)
    }

    if (next === 'broken-fleet') {
      const runners = fleet.filter(e => e.encounterRole === 'fleeing')
      const reinforcements = fleet.filter(e => e.encounterRole === 'reinforcement')
      check(
        'reinforcement waits beyond the runners',
        reinforcements.length > 0 && reinforcements.every(r => runners.every(e => dist(e.pos, game.ship.pos) < dist(r.pos, game.ship.pos))) && dist(reinforcements[0].pos, game.ship.pos) > 1600,
        `runners at ${runners.map(e => Math.round(dist(e.pos, game.ship.pos))).join('m, ')}m · relief at ${reinforcements.map(e => Math.round(dist(e.pos, game.ship.pos))).join('m, ')}m`,
      )
      const runnerHp = runners.reduce((sum, e) => sum + e.hp, 0)
      const rescueHp = reinforcements.reduce((sum, e) => sum + e.hp, 0)
      const runnerGuns = runners.reduce((sum, e) => sum + e.guns.length, 0)
      const rescueGuns = reinforcements.reduce((sum, e) => sum + e.guns.length, 0)
      check(
        'relief force badly outguns its charges',
        rescueHp > runnerHp * 2 && rescueGuns > runnerGuns,
        `${Math.round(rescueHp)}hp/${rescueGuns} guns relief vs ${Math.round(runnerHp)}hp/${runnerGuns} guns runners`,
      )
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
    if (next === 'pincer' || next === 'patrol') {
      const pursuer = fleet.find(e => e.mode === 'hunt' && (e.reserveT ?? 0) <= 0)!
      pursuer.patience = 0.01
      pursuer.pos = v(game.ship.pos.x + pursuer.deaggroR + 500, game.ship.pos.y)
      game.debugStepEnemies(0.05)
      if (next === 'pincer') {
        check('event fleet never lets up', pursuer.mode === 'hunt', 'distance and exhausted patience do not end the pursuit')
        check('event rowers do not tire', fleet.filter(e => e.kind === 'harrier').every(e => e.row === 1), 'committed harriers retain full chase speed')
      } else {
        check('patrol gives up a clean escape', pursuer.mode === 'roam', 'distance ends the limited pursuit')
      }
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
      check('convoy grouped tightly', escorts.every(e => dist(e.pos, anchor.pos) < 190), 'escorts begin within 190px of the prize')
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
      game.ship.hp = game.tierDef().hull
      game.over = false
      game.bullets = []
      game.debugStepEnemies(2.4)
      check('broadside holds while loading', game.bullets.filter(b => b.direct).length === 0, 'no loose gun fires ahead of its battery')
      let waited = 2.4
      while (waited < 5 && game.bullets.filter(b => b.direct).length === 0) {
        // Keep the harness on the same firing line while the convoy sails;
        // this assertion is about cadence, not whether the target held station.
        game.ship.pos = v(anchor.pos.x - 350, anchor.pos.y)
        game.debugStepEnemies(0.1)
        waited += 0.1
      }
      const second = game.bullets.filter(b => b.direct)
      check('broadside reloads in sync', second.length === 2, `${second.length} cannonballs leave together after ${waited.toFixed(1)}s`)
    }
    if (next === 'bombardment') {
      const artillery = fleet.find(e => e.encounterRole === 'artillery')!
      artillery.mode = 'hunt'
      game.debugStepEnemies(0.05)
      check('artillery anchors the objective', Math.hypot(artillery.vel.x, artillery.vel.y) < 0.01, 'mortar hull holds its station while ranging')
    }
    if (next === 'fireship-raid') {
      const fireship = fleet.find(e => e.kind === 'fireship')!
      const screens = fleet.filter(e => e.encounterRole === 'screen')
      check('fireship skips lookout hesitation', fireship.mode === 'hunt', 'reserve release goes directly into the charge')
      game.debugStepEnemies(0.05)
      const chargeA = fireship.chargeA
      game.ship.pos = v(game.ship.pos.x, game.ship.pos.y + 500)
      game.debugStepEnemies(0.1)
      check('fireship commits to one line', chargeA != null && fireship.chargeA === chargeA, 'dodging does not bend the charge back toward the player')
      fireship.chargeT = 0.01
      game.debugStepEnemies(0.05)
      game.debugStepEnemies(0.05)
      check('spent raid releases its escorts', !!fireship.sunk && screens.every(e => e.mode === 'roam' && e.encounterKind == null), 'one missed charge resolves the raid')
    }
    if (next === 'broken-fleet') {
      const runner = fleet.find(e => e.encounterRole === 'fleeing')!
      const reinforcements = fleet.filter(e => e.encounterRole === 'reinforcement')
      // Enter the rally radius from the side instead of overlapping the guard
      // ship at its exact authored station.
      runner.pos = v(runner.rally!.x + 180, runner.rally!.y)
      game.ship.pos = v(runner.rally!.x - 180, runner.rally!.y)
      runner.mode = 'hunt'
      runner.engaged = true
      game.debugStepEnemies(0.05)
      check(
        'rally wakes reinforcement',
        reinforcements.every(e => (e.reserveT ?? 1) === 0),
        `reserves ${reinforcements.map(e => (e.reserveT ?? 0).toFixed(2)).join(', ')} · runner ${runner.mode}/${runner.encounterRole}#${runner.encounterId} · rally gap ${runner.rally ? Math.round(dist(runner.pos, runner.rally)) : 'none'}m`,
      )
      check(
        'runner joins screen',
        runner.encounterRole === 'screen' && runner.rally == null,
        `runner ${runner.mode}/${runner.encounterRole} · rally ${runner.rally ? 'held' : 'cleared'}`,
      )
    }
    if (next === 'patrol') {
      const brawler = fleet.find(e => e.engaged && (e.kind === 'raider' || e.kind === 'harrier' || e.kind === 'galleon'))
      if (brawler) {
        brawler.wasEngaged = true
        brawler.sinceFired = 3.2
        brawler.pressT = 0
        game.debugStepEnemies(0.05)
        check('brawler presses proactively', (brawler.pressT ?? 0) > 0, 'silence alone triggers a charge without another incoming hit')
      }
      const hive = makePOI('hive', v(game.ship.pos.x + 100, game.ship.pos.y))
      const bastion = game.spawnEnemyShip({ at: hive.pos, kind: 'bastion', home: hive })
      const combatants = game.enemies
      game.enemies = [bastion]
      check('neutral bees do not lock combat', !game.inCombat(), 'a peaceful bastion can stand nearby without blocking recovery/refits')
      check(
        'hive uses its visible hitbox',
        onHiveIsland(hive, v(hive.pos.x + 60, hive.pos.y)) && !onHiveIsland(hive, v(hive.pos.x + 120, hive.pos.y)),
        'island impact provokes; a shot merely inside the POI radius does not'
      )
      game.enemies = combatants.filter(e => e !== bastion)

      const deckMount = game.mounts.find(m => m.plant)
      const deckPlant = deckMount?.plant
      if (deckMount && deckPlant) {
        const hp = deckPlant.hp
        const bullets = game.bullets.length
        const holdWater = game.water
        game.water = 0
        deckPlant.water = 0
        deckPlant.dryTime = 20
        game.firing = true
        game.debugStepShip(0.25)
        check('thirst never kills plants', deckPlant.hp === hp, 'a bone-dry plant loses no health')
        check('dry batteries stay silent', game.bullets.length === bullets, 'a dry plant cannot fire')
        game.water = 1
        deckPlant.water = 0.1
        deckPlant.activeT = 1
        game.debugStepShip(0.25)
        check('crew auto-waters from hold', game.water === 0 && deckPlant.water === 100, `${deckPlant.water.toFixed(0)} plant water after drawing the last cask`)
        deckMount.battleStations = false
        game.water = 1
        deckPlant.water = 0.1
        deckPlant.activeT = 1
        game.debugStepShip(0.25)
        check('stood-down mount does not draw a cask', game.water === 1, `${game.water} cask remains`)
        deckPlant.water = 100
        deckPlant.cooldown = 0
        const heldBullets = game.bullets.length
        game.firing = true
        game.debugStepShip(0.01)
        check('stood-down mount ignores fire order', game.bullets.length === heldBullets, 'no shell launched')
        deckMount.battleStations = true
        game.water = holdWater
        deckPlant.water = 0
        game.rainT = 1
        game.debugStepRain(0.5)
        check('rain soaks the battery', deckPlant.water > 0, `${deckPlant.water.toFixed(1)} water caught in half a second`)
      }
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
