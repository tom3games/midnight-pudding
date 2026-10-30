import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const server = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '0' } })
const PORT = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const b = await chromium.launch(); const p = await b.newPage({ locale: 'ja-JP' })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__mpReady, null, { timeout: 60000 })
for (const c of JSON.parse(process.argv[2])) {
  const r = await p.evaluate(c => {
    if (c.dawn) mp.D.DAWN = c.dawn; Object.assign(mp.TUNE, c)
    const ts = [], by = {}; let ok = 0, blind = []
    for (let i = 1; i <= 100; i++) { const o = mp.sim(5000 + i, 'bot', { items: 1 + (i % 3) }); if (o.outcome === 'ok') { ok++; ts.push(o.t) } else by[o.by] = (by[o.by] || 0) + 1; if (i <= 30) blind.push(mp.sim(5000 + i, 'always').t) }
    ts.sort((a, b) => a - b); blind.sort((a, b) => a - b)
    return { ok, med: ts[ts.length >> 1], max: ts[ts.length - 1], by, blindMax: blind[29] }
  }, c)
  console.log(JSON.stringify(c), JSON.stringify(r))
}
await b.close(); server.kill()
