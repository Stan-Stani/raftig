// raftig community ticket board — no login required, on purpose.
// Submissions and votes are rate-limited per IP (hashed, not stored raw)
// instead of gated behind an account. Good enough for a v1; revisit if abused.

const express = require('express')
const Database = require('better-sqlite3')
const crypto = require('crypto')
const path = require('path')

const PORT = process.env.PORT || 8795
const IP_SALT = process.env.IP_SALT || 'raftig-tickets-dev-salt-change-me'
const SUBMIT_LIMIT_PER_HOUR = 5

const db = new Database(path.join(__dirname, 'tickets.db'))
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'other',
    status TEXT NOT NULL DEFAULT 'open',
    votes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS votes (
    ticket_id INTEGER NOT NULL,
    ip_hash TEXT NOT NULL,
    PRIMARY KEY (ticket_id, ip_hash)
  );
  CREATE TABLE IF NOT EXISTS submissions (
    ip_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`)

function ipHash(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown'
  return crypto.createHash('sha256').update(IP_SALT + ip).digest('hex')
}

const app = express()
app.use(express.json({ limit: '10kb' }))

const CATEGORIES = new Set(['bug', 'feature', 'balance', 'other'])

app.get('/api/tickets', (req, res) => {
  const status = req.query.status
  const rows = status
    ? db.prepare('SELECT * FROM tickets WHERE status = ? ORDER BY votes DESC, created_at DESC').all(status)
    : db.prepare('SELECT * FROM tickets ORDER BY votes DESC, created_at DESC').all()
  res.json(rows)
})

app.post('/api/tickets', (req, res) => {
  const hash = ipHash(req)
  const since = Date.now() - 60 * 60 * 1000
  const recent = db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE ip_hash = ? AND created_at > ?').get(hash, since)
  if (recent.n >= SUBMIT_LIMIT_PER_HOUR) {
    return res.status(429).json({ error: `too many submissions — try again later (limit ${SUBMIT_LIMIT_PER_HOUR}/hour)` })
  }

  const title = String(req.body?.title || '').trim()
  const body = String(req.body?.body || '').trim()
  const category = CATEGORIES.has(req.body?.category) ? req.body.category : 'other'
  if (title.length < 3 || title.length > 140) {
    return res.status(400).json({ error: 'title must be 3-140 characters' })
  }
  if (body.length > 2000) {
    return res.status(400).json({ error: 'body must be under 2000 characters' })
  }

  const now = Date.now()
  const info = db.prepare('INSERT INTO tickets (title, body, category, created_at) VALUES (?, ?, ?, ?)').run(title, body, category, now)
  db.prepare('INSERT INTO submissions (ip_hash, created_at) VALUES (?, ?)').run(hash, now)
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(info.lastInsertRowid)
  res.status(201).json(ticket)
})

app.post('/api/tickets/:id/vote', (req, res) => {
  const id = Number(req.params.id)
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  if (!ticket) return res.status(404).json({ error: 'not found' })

  const hash = ipHash(req)
  try {
    db.prepare('INSERT INTO votes (ticket_id, ip_hash) VALUES (?, ?)').run(id, hash)
  } catch (e) {
    return res.status(409).json({ error: 'already voted', votes: ticket.votes })
  }
  db.prepare('UPDATE tickets SET votes = votes + 1 WHERE id = ?').run(id)
  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  res.json(updated)
})

app.get('/health', (req, res) => res.json({ ok: true }))

app.listen(PORT, '127.0.0.1', () => console.log(`raftig-tickets listening on 127.0.0.1:${PORT}`))
