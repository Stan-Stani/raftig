import type { Game } from './game'
import { ensureAudio } from './audio'

export const keys = new Set<string>()

export function initInput(canvas: HTMLCanvasElement, game: Game) {
  window.addEventListener('keydown', e => {
    if (e.repeat) return
    keys.add(e.code)
    game.keydown(e.code)
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
  })
  window.addEventListener('keyup', e => keys.delete(e.code))
  window.addEventListener('blur', () => keys.clear())

  canvas.addEventListener('pointermove', e => game.pointerMove(e.clientX, e.clientY))
  canvas.addEventListener('pointerdown', e => {
    ensureAudio()
    if (e.button === 0) game.click(e.clientX, e.clientY)
  })
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault()
    game.rightClick()
  })
  canvas.addEventListener('wheel', e => {
    e.preventDefault()
    game.wheel(Math.sign(e.deltaY))
  }, { passive: false })
}
