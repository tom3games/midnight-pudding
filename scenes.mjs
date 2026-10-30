// 場面ごとのスクショ（目視用）。W/H 環境変数でサイズ
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const server = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: '0' } })
const PORT = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const W = Number(process.env.W || 390), H = Number(process.env.H || 844), tag = `${W}x${H}`
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: W, height: H }, locale: 'ja-JP' })
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__mpReady); await p.evaluate(() => document.fonts.ready)
const shot = async n => { await p.waitForTimeout(150); await p.screenshot({ path: `shots/sc-${tag}-${n}.png` }) }
await p.waitForTimeout(600); await shot('title')
await p.click('#bHow'); await shot('how'); await p.click('#bHowBack')
await p.evaluate(() => { mp.startGame(11) }); await shot('tut'); await p.evaluate(() => mp.skipTut())
await p.evaluate(() => { mp.dbg.pause(true); mp.dbg.set({ s: 13.0 }); mp.dbg.step(60); const d = mp.dbg.fam('dad'); d.g = 60; d.hmmT = 1; mp.dbg.snapCam(); mp.dbg.render() }); await shot('living')
await p.evaluate(() => { mp.W.god = true; mp.dbg.set({ s: mp.LEN, sub: 'fridge', held: true }); mp.dbg.step(150); mp.dbg.set({ held: false }); mp.dbg.snapCam(); mp.dbg.render(); document.querySelector('#flash').style.opacity = 0 }); await shot('fridge')
await p.evaluate(() => { mp.dbg.step(40); mp.dbg.set({ s: 14.5 }); mp.dbg.step(200); mp.dbg.snapCam(); mp.dbg.render() }); await shot('return')
await p.evaluate(() => { mp.W.god = false; mp.dbg.caught('mom'); mp.dbg.step(80); mp.dbg.snapCam(); mp.dbg.render() }); await p.waitForTimeout(900); await shot('caught')
await p.evaluate(() => { mp.showResult(); mp.revealNow() }); await p.waitForTimeout(600); await shot('result-ng')
await p.evaluate(() => { mp.startGame(12); mp.W.god = true; mp.dbg.set({ items: 0 }); mp.dbg.set({ s: mp.LEN, sub: 'fridge', held: true }); mp.dbg.step(400); mp.dbg.set({ held: false }); mp.dbg.step(30); mp.dbg.set({ s: 0.05, held: true }); mp.dbg.step(2); mp.dbg.set({ held: false }); mp.dbg.step(100); mp.dbg.snapCam(); mp.dbg.render(); document.querySelector('#flash').style.opacity = 0; document.querySelectorAll('.fx').forEach(e => e.remove()) }); await shot('eat')
await p.evaluate(() => { mp.showResult(); mp.revealNow() }); await p.waitForTimeout(600); await shot('result-ok')
console.log(errs.join('\n') || 'no errors')
await b.close(); server.kill()
