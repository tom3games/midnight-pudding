// 全項目の自動検証。node verify.mjs（shots/ にスクショを出す）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' } })
const PORT = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
async function open(browser, opts = {}, tutDone = false) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await ctx.addInitScript(k => { try { localStorage.clear(); if (k) localStorage.setItem('mp.tut', '1') } catch (e) {} }, tutDone)
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0)
  try { await p.waitForFunction(() => window.__mpReady, null, { timeout: 45000 }) } catch (e) { throw new Error('not ready: ' + p.errs.join('|') + ' ' + await p.evaluate(() => document.body.innerText.slice(0, 300))) }
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) canvas,main:not([hidden]) .card,main:not([hidden]) .chip,#hold')) { if (!el.offsetParent || el.closest('[hidden]')) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  // カードの中身がカードからはみ出していない
  for (const c of document.querySelectorAll('main:not([hidden]) .card')) { if (c.scrollHeight > c.clientHeight + 2) over.push('cardScroll:' + c.scrollHeight + '>' + c.clientHeight) }
  return { H, over: over.slice(0, 6) }
})
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]

const browser = await chromium.launch()
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r)); return r
})
await t('OGP 一式がある（画像は公開URL・1200x630 の og.png）', async () => {
  const r = await p.evaluate(async () => {
    const m = k => document.querySelector(`meta[property="${k}"]`)?.content
    const img = new Image(); img.src = 'og.png'; await img.decode().catch(() => {})
    return { has: ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].every(k => !!m(k)) && !!document.querySelector('meta[name="twitter:card"]'), image: m('og:image'), url: m('og:url'), w: img.naturalWidth, h: img.naturalHeight }
  })
  expect(r.has && r.image === 'https://tom3games.github.io/midnight-pudding/og.png?v=1' && r.url === 'https://tom3games.github.io/midnight-pudding/' && r.w === 1200 && r.h === 630, JSON.stringify(r)); return r
})
await t('タイトル: 日本語で表示・ボタンが押せる', async () => {
  const r = await p.evaluate(() => ({ t: document.querySelector('.logo').textContent, s: document.querySelector('#bStart').textContent, vis: !document.querySelector('#vTitle').hidden }))
  expect(r.vis && /プリン作戦/.test(r.t) && r.s === 'はじめる', JSON.stringify(r)); return r
})
await t('3D が描けている（画面の輝度に散らばりがある）', async () => {
  const v = await p.evaluate(() => { const c = document.createElement('canvas'), s = document.querySelector('#cv'); c.width = 120; c.height = 200; const x = c.getContext('2d'); x.drawImage(s, 0, 0, 120, 200); const d = x.getImageData(0, 0, 120, 200).data; let a = 0, a2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; a += l; a2 += l * l; n++ } return Math.round(a2 / n - (a / n) ** 2) })
  expect(v > 80, 'variance ' + v); return { variance: v }
})
await t('遊び方: スマホ以外はキー操作の説明・戻れる', async () => {
  await p.click('#bHow')
  const r = await p.evaluate(() => ({ vis: !document.querySelector('#vHow').hidden, txt: document.querySelector('.rules').textContent }))
  await p.click('#bHowBack')
  expect(r.vis && /スペースキー/.test(r.txt) && /いびき/.test(r.txt) && /冷蔵庫/.test(r.txt), JSON.stringify(r).slice(0, 200)); return true
})
await t('初回はチュートリアルが出て、タップで閉じる（その間は時間が止まる）', async () => {
  await p.click('#bStart')
  const a = await p.evaluate(() => ({ tut: !document.querySelector('#tut').hidden, txt: document.querySelector('#tut').textContent, t: mp.G.t }))
  await p.waitForTimeout(400)
  const b = await p.evaluate(() => mp.G.t)
  await p.click('#tut')
  const c = await p.evaluate(() => ({ tut: !document.querySelector('#tut').hidden, stored: localStorage.getItem('mp.tut') }))
  expect(a.tut && /押している間/.test(a.txt) && b === 0 && !c.tut && c.stored === '1', JSON.stringify({ a, b, c })); return true
})
await t('押している間だけ進む（マウス）・離すと止まる', async () => {
  await p.evaluate(() => { mp.startGame(101); mp.dbg.pause(true); mp.W.god = true })
  await p.mouse.move(195, 600); await p.mouse.down()
  const a = await p.evaluate(() => { mp.dbg.step(30); return mp.G.s })
  await p.mouse.up()
  const b = await p.evaluate(() => { mp.dbg.step(30); return mp.G.s })
  expect(a > 1.2 && Math.abs(b - a) < 1e-9, JSON.stringify({ a, b })); return { half_sec: +a.toFixed(2) }
})
await t('スペースキーでも進む・離すと止まる', async () => {
  await p.keyboard.down(' ')
  const a = await p.evaluate(() => { const s0 = mp.G.s; mp.dbg.step(30); return mp.G.s - s0 })
  await p.keyboard.up(' ')
  const b = await p.evaluate(() => { const s0 = mp.G.s; mp.dbg.step(30); return mp.G.s - s0 })
  expect(a > 1.2 && b === 0, JSON.stringify({ a, b })); return true
})
await t('いびきが静かな間に動くとゲージがたまり、大きい間は ほぼたまらない', async () => {
  const r = await p.evaluate(() => {
    mp.W.god = false
    const out = {}
    for (const want of [true, false]) {
      mp.startGame(102); mp.skipTut(); mp.dbg.pause(true)
      const f = mp.dbg.fam('sister'); mp.dbg.set({ s: 6.6 })
      // 目当ての状態（大きい/静か）が0.3秒続く時刻まで進めてから動く
      let n = 0; while (!(mp.isLoud(f, mp.G.t) === want && mp.isLoud(f, mp.G.t + 0.3) === want) && n < 2000) { mp.dbg.step(1); n++ }
      const g0 = f.g; mp.dbg.set({ held: true }); mp.dbg.step(12); mp.dbg.set({ held: false, s: 6.6 })
      out[want ? 'loud' : 'quiet'] = +(f.g - g0).toFixed(1)
    }
    return out
  })
  expect(r.quiet > 12 && r.loud < 2, JSON.stringify(r)); return r
})
await t('きしむ板: 静かな時は家族のゲージが大きく上がり、いびき中は小さい', async () => {
  const r = await p.evaluate(() => {
    const out = {}
    for (const want of [true, false]) {
      mp.startGame(103); mp.skipTut(); mp.dbg.pause(true)
      const h = mp.HAZ[0], f = mp.dbg.fam('sister')
      let n = 0; while (!(mp.isLoud(f, mp.G.t) === want && mp.isLoud(f, mp.G.t + 0.5) === want) && n < 3000) { mp.dbg.step(1); n++ }
      mp.dbg.set({ s: h.s - 0.05 }); f.g = 0; mp.dbg.set({ held: true }); mp.dbg.step(2); mp.dbg.set({ held: false })
      out[want ? 'loud' : 'quiet'] = +f.g.toFixed(1)
    }
    return out
  })
  expect(r.quiet >= 40 && r.loud <= 12, JSON.stringify(r)); return r
})
await t('起き上がった家族に見られている間に動くと発覚、固まっていれば寝直す（起こした回数+1）', async () => {
  const r = await p.evaluate(() => {
    mp.startGame(104); mp.skipTut(); mp.dbg.pause(true); mp.dbg.set({ s: 6.6 })
    const f = mp.dbg.fam('sister'); f.g = 99.5; f.turned = true
    let n = 0; while (mp.isLoud(f, mp.G.t) && n < 600) { mp.dbg.step(1); n++ }
    mp.dbg.set({ held: true }); mp.dbg.step(2); mp.dbg.set({ held: false })
    const st1 = f.state, w1 = mp.G.wakes
    mp.dbg.step(60 * 3)
    const st2 = f.state, phase2 = mp.G.phase
    // もう一度起こして、今度は動く
    f.g = 99.5; n = 0; while (mp.isLoud(f, mp.G.t) && n < 600) { mp.dbg.step(1); n++ }
    mp.dbg.set({ held: true }); mp.dbg.step(30)
    return { st1, w1, st2, phase2, phase3: mp.G.phase, by: mp.G.by }
  })
  expect(r.st1 === 'look' && r.w1 === 1 && r.st2 === 'sleep' && r.phase2 === 'play' && r.phase3 === 'caught' && r.by === 'sister', JSON.stringify(r)); return r
})
await t('冷蔵庫: 押すと扉が開いて明かり、押し続けると最大6個取れて、離すと閉めて帰り道へ', async () => {
  const r = await p.evaluate(() => {
    mp.startGame(105); mp.skipTut(); mp.dbg.pause(true); mp.W.god = true
    mp.dbg.set({ s: mp.LEN - 0.05, held: true }); mp.dbg.step(3)
    const sub = mp.G.sub
    mp.dbg.step(60 * 1.2); const door = mp.G.door, lit = mp.G.lit
    mp.dbg.step(60 * 1.3); const i2 = mp.G.items
    mp.dbg.step(60 * 6); const imax = mp.G.items
    mp.dbg.set({ held: false }); mp.dbg.step(60)
    const out = { sub, door: +door.toFixed(2), lit, i2, imax, dir: mp.G.dir, after: mp.G.sub, doorAfter: mp.G.door }
    mp.dbg.set({ held: true }); mp.dbg.step(30); out.back = +(mp.LEN - mp.G.s).toFixed(2); mp.dbg.set({ held: false })
    mp.W.god = false; return out
  })
  expect(r.sub === 'fridge' && r.door === 1 && r.lit && r.i2 === 2 && r.imax === 6 && r.dir === -1 && r.after === 'walk' && r.doorAfter === 0 && r.back > 0.5, JSON.stringify(r)); return r
})
await t('冷蔵庫: 何も取らずに離しても帰らない（扉は少しずつ閉まる）', async () => {
  const r = await p.evaluate(() => {
    mp.startGame(106); mp.skipTut(); mp.dbg.pause(true); mp.W.god = true
    mp.dbg.set({ s: mp.LEN, sub: 'fridge', held: true }); mp.dbg.step(40); const d0 = mp.G.door; mp.dbg.set({ held: false }); mp.dbg.step(30)
    const r = { sub: mp.G.sub, d0: +d0.toFixed(2), door: +mp.G.door.toFixed(2), items: mp.G.items }; mp.W.god = false; return r
  })
  expect(r.sub === 'fridge' && r.door < r.d0 && r.door > 0 && r.items === 0, JSON.stringify(r)); return r
})
await t('帰り道: 寝ぼけた父にぶつかると抱き枕にされて止まる', async () => {
  const r = await p.evaluate(() => {
    mp.startGame(107); mp.skipTut(); mp.dbg.pause(true); mp.W.god = true
    mp.dbg.set({ items: 1, dir: -1, s: 12.0 }); mp.dbg.step(1)
    const dad = mp.dbg.fam('dad'); dad.walk.z = 1.9; dad.walk.wait = 5; dad.walk.x = mp.posAt(12.0).x
    mp.dbg.step(1); const hug = mp.G.hugT
    const s0 = mp.G.s; mp.dbg.set({ held: true }); mp.dbg.step(60); const moved = Math.abs(mp.G.s - s0)
    mp.dbg.set({ held: false }); mp.W.god = false
    return { state: dad.state, hug: +hug.toFixed(2), moved: +moved.toFixed(3) }
  })
  expect(r.state === 'walk' && r.hug > 2 && r.moved === 0, JSON.stringify(r)); return r
})
await t('朝4:10（70秒）になると時間切れで発覚', async () => {
  const r = await p.evaluate(() => { mp.startGame(108); mp.skipTut(); mp.dbg.pause(true); mp.dbg.step(60 * 71); return { phase: mp.G.phase, by: mp.G.by, clock: document.querySelector('#clockT').textContent } })
  expect(r.phase === 'caught' && r.by === 'dawn', JSON.stringify(r)); return r
})
await t('むずかしさ: いびきに合わせて動く上手いボットで100回中5〜6割成功・成功タイムの中央値は65秒以内', async () => {
  const r = await p.evaluate(() => { const ts = [], items = [], by = {}; let ok = 0; for (let i = 1; i <= 100; i++) { const o = mp.sim(5000 + i, 'bot', { items: 1 + (i % 3) }); if (o.outcome === 'ok') { ok++; ts.push(o.t); items.push(o.items) } else by[o.by] = (by[o.by] || 0) + 1 } ts.sort((a, b) => a - b); return { ok, med: ts[ts.length >> 1], min: ts[0], max: ts[ts.length - 1], items: [...new Set(items)].sort(), fails: by } })
  expect(r.ok >= 50 && r.ok <= 65 && r.med <= 65, JSON.stringify(r)); return r
})
await t('無呼吸: いびきが急に止まる区間があり、画面の波には事前に出ない', async () => {
  const r = await p.evaluate(() => { mp.startGame(130); mp.dbg.pause(true); const f = mp.dbg.fam('dad'); const ap = f.segs.filter(s => s[3]); const s0 = ap[0]; return { n: ap.length, total: f.segs.length, cut: s0 && +(s0[2] - s0[1]).toFixed(2), drop: s0 && +(mp.loudness(f, s0[1] - 0.06) - mp.loudness(f, s0[1] - 0.01)).toFixed(2) } })
  expect(r.n > 5 && r.cut > 0.3 && r.drop > 0.5, JSON.stringify(r)); return r
})
await t('押しっぱなしで突っ込むと序盤で見つかる／何もしないと朝で発覚', async () => {
  const r = await p.evaluate(() => { const a = []; for (let i = 1; i <= 20; i++) a.push(mp.sim(2000 + i, 'always')); const n = mp.sim(3000, 'never'); return { allCaught: a.every(o => o.outcome === 'ng'), maxT: Math.max(...a.map(o => o.t)), by: [...new Set(a.map(o => o.by))], never: n.by } })
  expect(r.allCaught && r.maxT < 20 && r.never === 'dawn', JSON.stringify(r)); return r
})
await t('同じ種なら同じ結果（再現性）', async () => {
  const r = await p.evaluate(() => [mp.sim(77, 'bot', { items: 2 }), mp.sim(77, 'bot', { items: 2 })].map(o => JSON.stringify(o)))
  expect(r[0] === r[1], r.join(' / ')); return true
})
await t('称号: 取れた数・起こした回数・タイムで段が上がり、免許皆伝と級もある', async () => {
  const r = await p.evaluate(() => {
    mp.startGame(109); mp.dbg.pause(true)
    const mk = o => { Object.assign(mp.G, o); const R = mp.calcResult(); mp.G.result = R; return mp.titleText(R) }
    return [mk({ outcome: 'ok', items: 1, wakes: 2, turns: 3, time: 70 }), mk({ outcome: 'ok', items: 3, wakes: 1, turns: 1, time: 50 }), mk({ outcome: 'ok', items: 6, wakes: 0, turns: 0, time: 39 }), mk({ outcome: 'ng', by: 'mom', dir: 1, s: 1 }), mk({ outcome: 'ng', by: 'dog', dir: -1, s: 1 })]
  })
  expect(r[0] === '夜食の忍者 初段' && r[1] === '夜食の忍者 五段' && r[2] === '夜食の忍者 免許皆伝' && r[3] === '夜食の見習い 十級' && r[4] === '夜食の見習い 一級', JSON.stringify(r)); return r
})
await t('発覚の場面 → 結果発表: 判定（ハンコ・称号）は発表まで見せない', async () => {
  await p.evaluate(() => { mp.startGame(110); mp.skipTut(); mp.dbg.pause(false); mp.dbg.caught('dad') })
  await p.waitForTimeout(700)
  const scene = await p.evaluate(() => ({ phase: mp.G.phase, says: [...document.querySelectorAll('.tagx')].filter(e => e.style.display !== 'none').map(e => e.textContent) }))
  await p.screenshot({ path: ROOT + '/shots/v-caught.png' })
  await p.waitForFunction(() => mp.G.phase === 'result', null, { timeout: 8000 })
  const early = await p.evaluate(() => ({ stamp: getComputedStyle(document.querySelector('#rStamp')).opacity, title: getComputedStyle(document.querySelector('#rTitle')).opacity }))
  await p.waitForTimeout(2600)
  const late = await p.evaluate(() => ({ stamp: getComputedStyle(document.querySelector('#rStamp')).opacity, txt: document.querySelector('#rStamp').textContent, title: document.querySelector('#rTitle').textContent, sub: document.querySelector('#rSub').textContent, cm: document.querySelectorAll('.cm').length }))
  await p.screenshot({ path: ROOT + '/shots/v-result-ng.png' })
  expect(scene.phase === 'caught' && scene.says.length >= 2 && +early.stamp < 0.1 && +early.title < 0.1 && +late.stamp > 0.9 && late.txt === '発覚' && /級/.test(late.title) && /父/.test(late.sub) && late.cm === 4, JSON.stringify({ scene, early, late })); return late
})
await t('成功 → 食べる場面 → 結果（成功のハンコ・段）', async () => {
  await p.evaluate(() => { mp.startGame(111); mp.skipTut(); mp.dbg.pause(true); mp.W.god = true; mp.dbg.set({ s: mp.LEN, sub: 'fridge', held: true }); mp.dbg.step(60 * 2.2); mp.dbg.set({ held: false }); mp.dbg.step(40); mp.dbg.set({ s: 0.02, held: true }); mp.dbg.step(2); mp.dbg.set({ held: false }); mp.W.god = false; mp.dbg.pause(false) })
  await p.waitForTimeout(1500)
  const ph = await p.evaluate(() => mp.G.phase)
  await p.evaluate(() => document.querySelector('#flash').style.opacity = 0)
  await p.screenshot({ path: ROOT + '/shots/v-eat.png' })
  await p.waitForFunction(() => mp.G.phase === 'result', null, { timeout: 8000 }); await p.evaluate(() => mp.revealNow()); await p.waitForTimeout(500)
  const r = await p.evaluate(() => ({ stamp: document.querySelector('#rStamp').textContent, title: document.querySelector('#rTitle').textContent, items: document.querySelector('#rItems').textContent, time: document.querySelector('#rTime').textContent }))
  await p.screenshot({ path: ROOT + '/shots/v-result-ok.png' })
  expect(ph === 'eat' && r.stamp === '成功' && /夜食の忍者/.test(r.title) && /個/.test(r.items) && /秒/.test(r.time), JSON.stringify({ ph, r })); return r
})
await t('結果画像: 1080x1350 の PNG を作ってダウンロードできる', async () => {
  const dl = p.waitForEvent('download', { timeout: 8000 })
  await p.click('#bSave')
  const d = await dl; const path = ROOT + '/shots/card.png'; await d.saveAs(path)
  const r = await p.evaluate(async () => { const b = await mp.makeCard(); const im = await createImageBitmap(b); return { w: im.width, h: im.height, size: b.size } })
  expect(d.suggestedFilename() === 'midnight-pudding.png' && r.w === 1080 && r.h === 1350 && r.size > 100000, JSON.stringify(r)); return r
})
await t('もう一回ですぐ遊べる（状態が初期化される）', async () => {
  await p.click('#bAgain')
  const r = await p.evaluate(() => ({ phase: mp.G.phase, s: mp.G.s, items: mp.G.items, wakes: mp.G.wakes, vis: !document.querySelector('#vPlay').hidden, tut: !document.querySelector('#tut').hidden, stack: 0 }))
  expect(r.phase === 'play' && r.s === 0 && r.items === 0 && r.wakes === 0 && r.vis && !r.tut, JSON.stringify(r)); return r
})
await t('音: 全部の効果音・曲・いびきを鳴らしてもエラーなし、実際に音が出ている', async () => {
  const r = await p.evaluate(async () => {
    const S = mp.Snd; S.init(); if (S.ctx.state !== 'running') await S.ctx.resume()
    for (const n of ['tap', 'step', 'creak', 'squeak', 'hmm', 'wake', 'door', 'light', 'close', 'grab', 'hug', 'caught', 'alarm', 'eat', 'yay', 'drum', 'stamp', 'fanfare', 'boo', 'full']) S.sfx(n)
    for (const k of ['sister', 'dad', 'dog', 'mom']) S.snore(k, 1, 2)
    let peak = 0; for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 50)); peak = Math.max(peak, S.level()) }
    for (const tr of ['title', 'sneak', 'win', 'lose']) { S.setTrack(tr); await new Promise(r => setTimeout(r, 400)); for (let i = 0; i < 5; i++) { S.tick(); await new Promise(r => setTimeout(r, 30)) } }
    return { peak: +peak.toFixed(3), played: Object.keys(S.played).length, bgm: Object.keys(S.played).filter(k => k.startsWith('bgm:')) }
  })
  expect(r.peak > 0.05 && r.played >= 21 && r.bgm.length >= 3 && p.errs.length === 0, JSON.stringify(r) + p.errs.join('|')); return r
})
await t('ミュートで音量0・状態が保存される', async () => {
  await p.click('#bHome'); await p.click('#vTitle .mute')
  const r = await p.evaluate(() => ({ m: mp.Snd.muted, g: mp.Snd.master.gain.value, ls: localStorage.getItem('mp.mute'), icon: document.querySelector('#vTitle .icOff').hidden }))
  await p.click('#vTitle .mute')
  expect(r.m && r.g === 0 && r.ls === '1' && !r.icon, JSON.stringify(r)); return r
})
await t('英語に切り替えると全画面が英語（タイトル・遊び方・結果・称号）', async () => {
  await p.click('#bLang')
  const a = await p.evaluate(() => ({ logo: document.querySelector('.logo').textContent, start: document.querySelector('#bStart').textContent, how: document.querySelector('.rules').textContent, lang: document.documentElement.lang }))
  await p.evaluate(() => { mp.startGame(112); mp.skipTut(); mp.dbg.pause(true); mp.dbg.caught('mom'); mp.showResult(); mp.revealNow() })
  await p.waitForTimeout(400)
  const b = await p.evaluate(() => ({ stamp: document.querySelector('#rStamp').textContent, title: document.querySelector('#rTitle').textContent, sub: document.querySelector('#rSub').textContent, cm: document.querySelector('.cmts').textContent, btn: document.querySelector('#bAgain').textContent }))
  await p.screenshot({ path: ROOT + '/shots/v-result-en.png' })
  const jp = /[぀-ヿ一-龯]/
  expect(/MIDNIGHT/.test(a.logo) && a.start === 'START' && !jp.test(a.how) && a.lang === 'en' && b.stamp === 'BUSTED' && /Kyu/.test(b.title) && !jp.test(b.title + b.sub + b.cm + b.btn), JSON.stringify({ a, b }).slice(0, 300)); return b
})
await t('英語のまま遊んでも日本語が出ない（プレイ中の吹き出し・合図）', async () => {
  const r = await p.evaluate(() => { mp.startGame(113); mp.skipTut(); mp.dbg.pause(true); mp.dbg.set({ s: 4.5 }); mp.dbg.step(90); mp.dbg.render(); return document.querySelector('#vPlay').innerText })
  await p.evaluate(() => { localStorage.setItem('mp.lang', 'ja'); mp.S.lang = 'ja'; mp.applyLang() })
  expect(!/[぀-ヿ一-龯]/.test(r), r.slice(0, 200)); return true
})
await t('エラーが出ていない（ここまで通し）', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// 6サイズ × 全画面で一画面に収まる
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  const views = {}
  const snap = async v => { await q.evaluate(() => document.fonts.ready); views[v] = await fit(q); views[v].o = await overflow(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-${v}.png` }) }
  await snap('title')
  await q.click('#bHow'); await snap('how'); await q.click('#bHowBack')
  await q.click('#bStart'); await snap('tut')
  await q.click('#tut'); await q.evaluate(() => { mp.dbg.pause(true); mp.dbg.set({ s: 13 }); mp.dbg.step(80); mp.dbg.fam('dad').hmmT = 1; mp.dbg.snapCam(); mp.dbg.render() }); await snap('play')
  await q.evaluate(() => { mp.W.god = true; mp.dbg.set({ s: mp.LEN, sub: 'fridge', held: true }); mp.dbg.step(150); mp.dbg.set({ held: false }); mp.W.god = false; document.querySelectorAll('.fx').forEach(e => e.remove()); document.querySelector('#flash').style.opacity = 0; mp.dbg.snapCam(); mp.dbg.render() }); await snap('fridge')
  await q.evaluate(() => { mp.dbg.pause(false); mp.dbg.caught('mom') }); await q.waitForTimeout(1600); await snap('caught')
  await q.evaluate(() => { mp.showResult(); mp.revealNow() }); await q.waitForTimeout(500); await snap('result')
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length && r.o.sw <= r.o.W && !r.o.bad.length, JSON.stringify(r)) })
  await t(`${name}: エラーなし`, async () => { expect(!q.errs.length, q.errs.join('|')) })
  await q.close()
}
await browser.close()

// fps（GPU を使う Chromium・プレイ中）
{
  const gb = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const q = await open(gb, { viewport: { width: w, height: h } }, true)
    await q.evaluate(() => { mp.startGame(120); mp.W.god = true; mp.setHold(true) })
    await q.waitForTimeout(500)
    const r = await q.evaluate(async () => { const f0 = mp.fps(), t0 = performance.now(); await new Promise(r => setTimeout(r, 3000)); return Math.round((mp.fps() - f0) / ((performance.now() - t0) / 1000)) })
    await t(`fps ${w}x${h}（プレイ中・GPU）`, async () => { expect(r >= 50, 'fps ' + r); return { fps: r } })
    await q.close()
  }
  await gb.close()
}

// WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで開始 → スマホ向けの説明 → 押している間だけ進む', async () => {
  await wp.tap('#bStart')
  const txt = await wp.evaluate(() => document.querySelector('#tut').textContent)
  await wp.tap('#tut')
  const r = await wp.evaluate(() => {
    mp.dbg.pause(true); mp.W.god = true
    const hit = document.querySelector('#hit'), o = { bubbles: true, cancelable: true, pointerType: 'touch', clientX: 200, clientY: 500, isPrimary: true, pointerId: 3 }
    hit.dispatchEvent(new PointerEvent('pointerdown', o)); mp.dbg.step(30); const a = mp.G.s
    hit.dispatchEvent(new PointerEvent('pointerup', o)); mp.dbg.step(30); const b = mp.G.s
    return { a, b }
  })
  await wp.screenshot({ path: ROOT + '/shots/webkit-play.png' })
  expect(/画面を押している間/.test(txt) && r.a > 1.2 && r.a === r.b, JSON.stringify({ txt, r })); return r
})
await t('WebKit: 結果画像を作れる', async () => {
  const r = await wp.evaluate(async () => { mp.W.god = false; mp.dbg.caught('dog'); mp.showResult(); mp.revealNow(); const b = await mp.makeCard(); return b && b.size })
  await wp.screenshot({ path: ROOT + '/shots/webkit-result.png' })
  expect(r > 50000, r); return { size: r }
})
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
