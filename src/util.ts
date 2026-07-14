export interface Vec {
  x: number
  y: number
}

export const v = (x: number, y: number): Vec => ({ x, y })
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** rand(hi) → [0,hi), rand(lo,hi) → [lo,hi) */
export const rand = (a = 1, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a))
export const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1))
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export function weighted<T>(items: T[], w: (t: T) => number): T {
  let total = 0
  for (const it of items) total += w(it)
  let roll = Math.random() * total
  for (const it of items) {
    roll -= w(it)
    if (roll <= 0) return it
  }
  return items[items.length - 1]
}

/** signed shortest angle from b to a, in [-π, π] */
export function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

export const gkey = (gx: number, gy: number) => `${gx},${gy}`

/** cheap deterministic hash → [0,1), for stable procedural visuals */
export function hash01(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** compound swell: three sine waves at different wavelengths/angles/phases,
 *  summed and normalized to roughly [-1, 1] — callers scale for amplitude.
 *  Cheap stand-in for real wave displacement (same trick Wind Waker's ocean
 *  used), sampled wherever a hull needs to bob or tilt with the sea. */
export function waveHeight(x: number, y: number, t: number): number {
  const s1 = Math.sin(x * 0.006 + y * 0.004 + t * 1.1)
  const s2 = Math.sin(x * 0.012 - y * 0.014 + t * 1.7 + 2.1)
  const s3 = Math.sin(-x * 0.018 + y * 0.01 + t * 0.65 + 5.4)
  return (s1 + s2 * 0.6 + s3 * 0.4) / 2.1
}
