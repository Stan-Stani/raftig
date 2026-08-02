// Shared WebAudio bus for the looping score and tiny oscillator-envelope SFX.

let actx: AudioContext | null = null
let musicGain: GainNode | null = null
let musicSource: AudioBufferSourceNode | null = null
let musicLoading: Promise<void> | null = null
export let muted = false

const MUSIC_VOLUME = 0.1

async function startMusic() {
  if (!actx || musicSource) return
  if (musicLoading) return musicLoading

  const ctx = actx
  musicLoading = (async () => {
    try {
      // Vorbis stays small while preserving the loop boundary far better than
      // MP3's encoder padding does.
      const url = new URL('audio/brinegarden.ogg', document.baseURI).href
      const response = await fetch(url)
      if (!response.ok) throw new Error(`music request failed (${response.status})`)
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
      // Another gesture may have completed the load while this one decoded.
      if (musicSource) return
      musicGain = ctx.createGain()
      musicGain.gain.value = muted ? 0 : MUSIC_VOLUME
      musicGain.connect(ctx.destination)
      musicSource = ctx.createBufferSource()
      musicSource.buffer = buffer
      musicSource.loop = true
      musicSource.connect(musicGain)
      musicSource.start()
    } catch (error) {
      // Audio should never keep the game from running. Leave a useful clue for
      // local builds while allowing a later gesture to retry a failed request.
      console.warn('Could not start Brinegarden soundtrack.', error)
      musicLoading = null
    }
  })()
  return musicLoading
}

/** Call from a user gesture (autoplay policy). */
export function ensureAudio() {
  if (!actx) {
    try {
      actx = new AudioContext()
    } catch {
      return
    }
  }
  if (actx.state === 'suspended') void actx.resume().then(startMusic)
  else void startMusic()
}

export function toggleMute(): boolean {
  muted = !muted
  if (musicGain && actx) {
    musicGain.gain.cancelScheduledValues(actx.currentTime)
    musicGain.gain.setTargetAtTime(muted ? 0 : MUSIC_VOLUME, actx.currentTime, 0.025)
  }
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
  | 'notice'
  | 'salvage'
  | 'scuttle'
  | 'alarm'

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
    case 'notice':
      tone(520, 0.09, 'sine', 0.03, 70)
      break
    case 'salvage':
      tone(392, 0.1, 'sine', 0.05)
      tone(523, 0.1, 'sine', 0.05, 0, 0.09)
      tone(659, 0.16, 'sine', 0.05, 0, 0.18)
      tone(120, 0.25, 'triangle', 0.05, -30, 0.02)
      break
    case 'scuttle':
      // the jackpot kill: a crunch, then a rising three-note prize call
      tone(110, 0.25, 'sawtooth', 0.07, -50)
      tone(440, 0.1, 'sine', 0.05, 0, 0.12)
      tone(554, 0.1, 'sine', 0.05, 0, 0.22)
      tone(659, 0.2, 'sine', 0.06, 0, 0.32)
      break
    case 'alarm':
      // low double heartbeat under the red vignette — quiet, felt not heard
      tone(70, 0.16, 'sine', 0.08)
      tone(64, 0.2, 'sine', 0.06, 0, 0.22)
      break
  }
}
