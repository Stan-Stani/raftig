// Tiny WebAudio synth — all sfx are oscillator envelopes, no assets.

let actx: AudioContext | null = null
export let muted = false

/** Call from a user gesture (autoplay policy). */
export function ensureAudio() {
  if (!actx) {
    try {
      actx = new AudioContext()
    } catch {
      return
    }
  }
  if (actx.state === 'suspended') void actx.resume()
}

export function toggleMute(): boolean {
  muted = !muted
  return muted
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0, delay = 0) {
  if (!actx || muted) return
  const t0 = actx.currentTime + delay
  const osc = actx.createOscillator()
  const g = actx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slide) osc.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t0 + dur)
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(actx.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export type SfxName =
  | 'shoot'
  | 'hit'
  | 'break'
  | 'collect'
  | 'build'
  | 'water'
  | 'breed'
  | 'sunk'
  | 'over'
  | 'deny'
  | 'spot'

export function sfx(name: SfxName) {
  if (!actx || muted) return
  switch (name) {
    case 'shoot':
      tone(500 + Math.random() * 140, 0.06, 'square', 0.02, -180)
      break
    case 'hit':
      tone(200 + Math.random() * 40, 0.08, 'sawtooth', 0.035, -70)
      break
    case 'break':
      tone(130, 0.28, 'sawtooth', 0.07, -70)
      tone(90, 0.3, 'triangle', 0.06, -40, 0.03)
      break
    case 'collect':
      tone(660, 0.07, 'sine', 0.05)
      tone(880, 0.1, 'sine', 0.05, 0, 0.07)
      break
    case 'build':
      tone(170, 0.09, 'triangle', 0.06, -30)
      break
    case 'water':
      tone(320, 0.12, 'sine', 0.05, 260)
      break
    case 'breed':
      tone(523, 0.09, 'sine', 0.05)
      tone(659, 0.09, 'sine', 0.05, 0, 0.09)
      tone(784, 0.14, 'sine', 0.05, 0, 0.18)
      break
    case 'sunk':
      tone(95, 0.4, 'sawtooth', 0.08, -40)
      tone(600, 0.2, 'sine', 0.04, -300, 0.05)
      break
    case 'over':
      tone(330, 0.5, 'triangle', 0.07, -220)
      tone(165, 0.7, 'sawtooth', 0.05, -80, 0.3)
      break
    case 'deny':
      tone(150, 0.09, 'square', 0.03, -20)
      break
    case 'spot':
      tone(440, 0.12, 'square', 0.035, 120)
      tone(587, 0.16, 'square', 0.03, 100, 0.12)
      break
  }
}
