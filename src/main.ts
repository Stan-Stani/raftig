import { Game } from './game'
import { initInput } from './input'
import { render } from './render'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const game = new Game()
// debug handle for poking at a run from the console
;(window as unknown as { __game: Game }).__game = game

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

initInput(canvas, game)

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  game.update(dt)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render(ctx, game)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
