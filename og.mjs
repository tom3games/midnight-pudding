// SNS用サムネ og.png（1200x630）。node og.mjs
// 冷蔵庫を開けて明かりがパッと漏れ、母が「ん…？」、犬が起きかけている瞬間＋タイトル
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' } })
const PORT = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.addInitScript(() => { try { localStorage.setItem('mp.tut', '1'); localStorage.setItem('mp.lang', 'ja') } catch (e) {} })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__mpReady)
await p.evaluate(() => document.fonts.ready)
await p.evaluate(() => {
  mp.startGame(31); mp.dbg.pause(true); mp.W.god = true
  mp.W.heroRy = 0.6
  mp.W.camAt = [12.9, -1.9, 0.72]
  mp.dbg.set({ s: mp.LEN, sub: 'fridge', held: true }); mp.dbg.step(60 * 3.75)
  const mom = mp.dbg.fam('mom'); mom.hmmT = 5; mom.g = 72
  const dog = mp.dbg.fam('dog'); dog.state = 'look'; dog.lookT = 9; dog.g = 100
  mp.dbg.snapCam(); mp.dbg.render()
  document.querySelectorAll('.fx').forEach(e => e.remove()); document.querySelector('#flash').style.opacity = 0
})
await p.addStyleTag({ content: `.hud,#strips,#hold,#skipHint{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 54%;background:linear-gradient(90deg,rgba(11,16,36,0),rgba(11,16,36,.94) 22%);z-index:30}` })
await p.evaluate(() => {
  mp.dbg.render()
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:34px;top:0;bottom:0;width:500px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:26px;color:#fff;text-align:center'
  d.innerHTML = `<div style="font-family:'Dela Gothic One';line-height:1.02;filter:drop-shadow(0 7px 0 #16122a)">
    <div style="font-size:60px;color:#dbe8ff;-webkit-text-stroke:3px #16122a;paint-order:stroke fill;letter-spacing:.1em">深夜の</div>
    <div style="font-size:104px;color:#ffd23f;-webkit-text-stroke:5px #16122a;paint-order:stroke fill;transform:rotate(-3deg)">プリン作戦</div></div>
  <div style="font-weight:900;font-size:31px;line-height:1.45;font-family:'Zen Maru Gothic';background:rgba(11,16,36,.8);border:3px solid rgba(219,232,255,.45);border-radius:18px;padding:12px 22px">家族が起きる前に、<br>冷蔵庫のプリンを取ってこい。</div>
  <div style="font-family:'Dela Gothic One';font-size:22px;color:#ff8fb1;letter-spacing:.08em">MIDNIGHT PUDDING</div>`
  document.body.appendChild(d)
})
await p.waitForTimeout(400)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
