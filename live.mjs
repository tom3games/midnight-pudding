// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
// midnight-pudding __mp を置き換え、「遊びの通し」をゲームに合わせて書く
import { chromium, webkit } from 'playwright'
const URL0 = 'https://tom3games.github.io/midnight-pudding/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts }), p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__mpReady, null, { timeout: 15000 })
  // 遊びの通し: タイトル → 開始 → チュートリアル → 押して進む → 見つかる → 結果
  await p.waitForSelector('#bStart', { state: 'visible', timeout: 15000 }); if (opts.hasTouch) await p.tap('#bStart'); else await p.click('#bStart')
  await p.evaluate(() => { mp.skipTut(); mp.setHold(true) }); await p.waitForTimeout(1500)
  const moved = await p.evaluate(() => mp.G.s); out.push(`${name}: moved=${moved.toFixed(2)}`)
  await p.evaluate(() => { mp.setHold(false); mp.dbg.caught('mom') }); await p.waitForFunction(() => mp.G.phase === 'result', null, { timeout: 10000 })
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const ID = new RegExp(['tmk', '4men'].join(''), 'i') // 個人IDを文字列で持たない
const b = await chromium.launch(), p = await b.newPage()
for (const u of ['https://github.com/tom3games/midnight-pudding', 'https://github.com/tom3games/midnight-pudding/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} personalId=${ID.test(await p.content()) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
