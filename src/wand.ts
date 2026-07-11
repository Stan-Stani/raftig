// Noita-style wand rigging for raft mounts. A mount holds an ordered list of
// COMPONENTS; firing compiles that list into SHOTS. Modifiers accumulate onto
// the next shell (and are consumed by it), so ORDER MATTERS — the same parts in
// a different order build a different gun. A trigger makes the next shell a
// carrier that, on burst, casts the rest of the stack where it lands. That
// nesting is the whole point: it's what turns parts into a weapon you authored.
//
// PROTOTYPE SCOPE: the palette below is a free, unlimited toolbox so we can feel
// whether arranging parts is fun. Sourcing components from breeding (the plant's
// genome yields the parts you can slot) is the next step, not this one.

import { Element } from './genetics'

export type CompKind = 'shell' | 'mod' | 'trigger'

export interface CompDef {
  id: string
  kind: CompKind
  icon: string
  name: string
  tip: string
  // shell params ---------------------------------------------------------
  fan?: number // sub-shots fired in one spread (1 = single)
  spread?: number // radians between fan shots
  dmgMult?: number // shell's own damage factor
  splashMult?: number // shell's own burst-radius factor
  slow?: number // shell's own cycle-time factor (cost of a big shell)
  // modifier params (fold into the accumulator, applied to the next shell) --
  modDmg?: number
  modSplash?: number
  modRange?: number
  modSlow?: number
  element?: Element
  homing?: boolean
  pierce?: boolean
}

/** strip-all-components sentinel — selectable in the pouch, never a real slot */
export const CLEAR: CompDef = {
  id: 'clear',
  kind: 'mod',
  icon: '✕',
  name: 'clear mount',
  tip: 'rig-click a mount to strip every component off it',
}

export const MAX_SLOTS = 4

/** the prototype toolbox: two shells, four modifiers, one trigger */
export const PALETTE: CompDef[] = [
  CLEAR,
  { id: 'ball', kind: 'shell', icon: '⬤', name: 'heavy ball', tip: 'one heavy shell — big burst, slow cycle', fan: 1, dmgMult: 1.25, splashMult: 1.3, slow: 1.2 },
  { id: 'scatter', kind: 'shell', icon: '⁘', name: 'scatter', tip: 'three light shells in a fan', fan: 3, spread: 0.17, dmgMult: 0.5, splashMult: 0.8 },
  { id: 'heavy', kind: 'mod', icon: '⬆', name: 'heavy shot', tip: '+damage, +burst — but a slower cycle', modDmg: 1.6, modSplash: 1.2, modSlow: 1.25 },
  { id: 'homing', kind: 'mod', icon: '🎯', name: 'homing', tip: 'the next shell curves toward the nearest raider', modDmg: 0.85, homing: true },
  { id: 'frost', kind: 'mod', icon: '❄', name: 'frost', tip: 'the next shell chills — slows the raider on hit', element: 'frost' },
  { id: 'pierce', kind: 'mod', icon: '✷', name: 'pierce', tip: 'shrapnel shell — a much bigger burst', modSplash: 1.5, pierce: true },
  { id: 'airburst', kind: 'trigger', icon: '💥', name: 'airburst', tip: 'the next shell bursts and casts the REST of the stack where it lands' },
]

export function compById(id: string): CompDef | undefined {
  return PALETTE.find(c => c.id === id)
}

/** a compiled firing instruction — one (possibly fanned) shell, maybe carrying
 *  a payload of further shots to cast at its burst point */
export interface Shot {
  dmgMult: number
  splashMult: number
  rangeMult: number
  slow: number
  fan: number
  spread: number
  element: Element | null // null = keep the plant's innate element
  homing: boolean
  pierce: boolean
  payload: Shot[]
}

interface Mods {
  dmg: number
  splash: number
  range: number
  slow: number
  element: Element | null
  homing: boolean
  pierce: boolean
}

function freshMods(): Mods {
  return { dmg: 1, splash: 1, range: 1, slow: 1, element: null, homing: false, pierce: false }
}

function applyMod(m: Mods, c: CompDef) {
  m.dmg *= c.modDmg ?? 1
  m.splash *= c.modSplash ?? 1
  m.range *= c.modRange ?? 1
  m.slow *= c.modSlow ?? 1
  if (c.element) m.element = c.element
  if (c.homing) m.homing = true
  if (c.pierce) m.pierce = true
}

function makeShot(c: CompDef, m: Mods): Shot {
  return {
    dmgMult: (c.dmgMult ?? 1) * m.dmg,
    splashMult: (c.splashMult ?? 1) * m.splash,
    rangeMult: m.range,
    slow: (c.slow ?? 1) * m.slow,
    fan: c.fan ?? 1,
    spread: c.spread ?? 0,
    element: m.element,
    homing: m.homing,
    pierce: m.pierce,
    payload: [],
  }
}

/** Compile a mount's component list into the shots one pull of the lanyard
 *  fires. Modifiers ride onto the next shell and are then spent; a trigger
 *  folds everything after it into the next shell's payload (recursively, so
 *  triggers nest). Returns [] for an empty or shell-less stack. */
export function compile(tokens: CompDef[], start?: Mods): Shot[] {
  const mods = start ? { ...start } : freshMods()
  const shots: Shot[] = []
  let i = 0
  while (i < tokens.length) {
    const c = tokens[i]
    if (c.kind === 'mod') {
      applyMod(mods, c)
      i++
      continue
    }
    if (c.kind === 'trigger') {
      // the next shell (with the mods gathered so far) becomes the carrier;
      // everything past it is cast at the carrier's burst point
      const rest = compile(tokens.slice(i + 1), { ...mods })
      if (rest.length) {
        const carrier = rest[0]
        carrier.payload = carrier.payload.concat(rest.slice(1))
        shots.push(carrier)
      }
      break
    }
    // a shell: fire it with the accumulated mods, then spend them
    shots.push(makeShot(c, mods))
    Object.assign(mods, freshMods())
    i++
  }
  return shots
}

/** icon strip for a mount's build, e.g. "💥 ⬤ ❄ ⁘" — or "—" when bare */
export function buildLabel(tokens: CompDef[]): string {
  return tokens.length ? tokens.map(c => c.icon).join(' ') : '—'
}

/** every shot in a plan, payloads included — for tallying reload cost */
export function flattenShots(shots: Shot[]): Shot[] {
  const out: Shot[] = []
  for (const s of shots) {
    out.push(s)
    if (s.payload.length) out.push(...flattenShots(s.payload))
  }
  return out
}
