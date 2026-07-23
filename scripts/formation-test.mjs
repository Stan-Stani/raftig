import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
let failed = false
try {
  const { Game } = await server.ssrLoadModule('/src/game.ts')
  const { createFormationDebug } = await server.ssrLoadModule('/src/formation-debug.ts')
  const reports = createFormationDebug(new Game()).verifyAll()
  for (const report of reports) {
    console.log(`\n${report.kind}`)
    for (const check of report.checks) {
      console.log(`  ${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`)
      failed ||= !check.pass
    }
  }
} finally {
  await server.close()
}
if (failed) throw new Error('formation regression checks failed')
