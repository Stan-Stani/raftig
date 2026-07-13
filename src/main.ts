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
initFeedback(game)

/** the "suggest something" modal — a real HTML form overlaid on the canvas,
 *  since typed text needs a real input, not hand-rolled canvas keystrokes.
 *  Talks straight to the ticket board API on the same origin. */
function initFeedback(game: Game) {
  const modal = document.getElementById('feedback')!
  const form = document.getElementById('feedbackForm') as HTMLFormElement
  const title = document.getElementById('fbTitle') as HTMLInputElement
  const category = document.getElementById('fbCategory') as HTMLSelectElement
  const body = document.getElementById('fbBody') as HTMLTextAreaElement
  const msg = document.getElementById('feedbackMsg')!
  const closeBtn = document.getElementById('fbClose')!

  const close = () => {
    game.feedbackOpen = false
  }

  let wasOpen = false
  function sync() {
    if (game.feedbackOpen !== wasOpen) {
      wasOpen = game.feedbackOpen
      modal.classList.toggle('open', wasOpen)
      if (wasOpen) {
        msg.textContent = ''
        msg.style.color = ''
        title.focus()
      }
    }
    requestAnimationFrame(sync)
  }
  sync()

  closeBtn.addEventListener('click', close)
  modal.addEventListener('click', e => {
    if (e.target === modal) close()
  })
  // Escape must close the modal even while a form field has focus, so this
  // listens on window directly rather than going through the game's own
  // keydown (input.ts steps aside entirely while a field is focused)
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape' && game.feedbackOpen) close()
  })

  form.addEventListener('submit', async e => {
    e.preventDefault()
    const submitBtn = form.querySelector('button[type=submit]') as HTMLButtonElement
    submitBtn.disabled = true
    msg.textContent = ''
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.value, body: body.value, category: category.value }),
      })
      const data = await res.json()
      if (!res.ok) {
        msg.style.color = '#ffb3b3'
        msg.textContent = data.error || 'something went wrong'
      } else {
        msg.style.color = '#b8e986'
        msg.textContent = 'submitted — thanks!'
        form.reset()
      }
    } catch {
      msg.style.color = '#ffb3b3'
      msg.textContent = 'network error — try again'
    } finally {
      submitBtn.disabled = false
    }
  })
}

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
