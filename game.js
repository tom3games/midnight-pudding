// 深夜のプリン作戦 / MIDNIGHT PUDDING
// 1ボタン（押している間だけ進む）。いびきが大きい間だけ動いてよい。演出も判定も固定60Hz
import * as THREE from 'three'
const D = window.MP_DATA, Snd = window.Snd
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]
const STEP = 1 / 60, PI = Math.PI
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }

// ---------- 設定・状態
const S = { lang: 'ja', pc: !matchMedia('(pointer:coarse)').matches, tut: false }
const T = k => D.STR[S.lang][k] ?? k
const TUNE = { botRisk: 30, speed: 2.8, rate: 150, decay: 8, apnea: 0.45, grace: 0.25, light: 28, dadV: 1.5 }, MAXI = D.ITEMS.length

// 道（押している間だけこの線の上を進む）
const PATH = [[-12.3, -0.9], [-9.0, 0.3], [-5.0, 0.4], [-2.0, 0.6], [0.6, 1.9], [4.4, 1.9], [7.0, 0.5], [10.2, 0.0], [11.95, -1.55]]
const SEG = []; let LEN = 0
for (let i = 0; i < PATH.length - 1; i++) { const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1], l = Math.hypot(bx - ax, bz - az); SEG.push({ ax, az, bx, bz, l, s0: LEN }); LEN += l }
function posAt(s) {
  s = clamp(s, 0, LEN)
  for (const g of SEG) if (s <= g.s0 + g.l || g === SEG[SEG.length - 1]) { const k = (s - g.s0) / g.l; return { x: lerp(g.ax, g.bx, k), z: lerp(g.az, g.bz, k), dx: (g.bx - g.ax) / g.l, dz: (g.bz - g.az) / g.l } }
}
function sOf(x, z) { let best = 0, bd = 1e9; for (let s = 0; s <= LEN; s += 0.02) { const p = posAt(s), d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = s } } return best }

// 寝ている家族の置き場所
const SPOTS = {
  sister: { x: -5.6, z: -2.35, pose: 'futon', ry: PI / 2 },
  dad: { x: 2.6, z: -2.75, pose: 'sofa', ry: -PI / 2 },
  dog: { x: 6.3, z: -2.6, pose: 'dog', ry: 0.5 },
  mom: { x: 9.8, z: -3.15, pose: 'chair', ry: 0 },
}
// 音の出る物（道の上）
const HAZ = [
  { id: 'board', x: -7.0, z: 0.35 },
  { id: 'board', x: -3.6, z: 0.5 },
  { id: 'toy', x: -0.6, z: 1.3 },
  { id: 'board', x: 3.2, z: 1.9 },
  { id: 'toy', x: 5.6, z: 1.25 },
  { id: 'board', x: 8.9, z: 0.2 },
]
for (const h of HAZ) h.s = sOf(h.x, h.z)
const DAD_WALK = { x: 2.6, z0: -1.9, z1: 3.0 }

let G = null
function newGame(seed) {
  const r = rng(seed)
  G = {
    seed, r, phase: 'play', sub: 'walk', t: 0, s: 0, dir: 1, held: false, moving: false, acting: false, items: 0, door: 0, grabT: 0, lit: false,
    wakes: 0, turns: 0, by: null, hugT: 0, hugCd: 0, sceneT: 0, outcome: null, result: null, toyKicked: false, lastS: 0, stepT: 0, sim: G?.sim || false,
    fam: D.FAMILY.map(f => ({ ...f, def: f, g: 0, state: 'sleep', lookT: 0, wakeN: 0, turned: false, turnAnim: 0, hmmT: 0, segs: snoreSegs(f, r), wasLoud: false, walk: null })),
  }
  for (const f of G.fam) f.spot = SPOTS[f.id]
}
// いびきの波（大きい区間のリスト）
function snoreSegs(f, r) {
  const segs = []; let t = -r() * 2.5
  while (t < 260) {
    const a = t, vb = a + lerp(f.loud[0], f.loud[1], r()), ap = r() < TUNE.apnea
    const b = ap ? a + (vb - a) * lerp(0.35, 0.6, r()) : vb
    segs.push([a, b, vb, ap]); t = b + lerp(f.quiet[0], f.quiet[1], r())
  }
  return segs
}
function loudness(f, t) {
  for (const [a, b, , ap] of f.segs) { if (t < a) return 0; if (t <= b) return clamp(Math.min((t - a) / 0.3, (b - t) / (ap ? 0.04 : 0.3)), 0, 1) }
  return 0
}
// 画面の波に見えている大きさ（無呼吸はまだ起きていない分は見えない）
function visibleLoud(f, t, now) {
  for (const [a, b, vb] of f.segs) { if (t < a) return false; const e = b < now ? b : vb; if (t <= e) return Math.min(t - a, e - t) > 0.15 }
  return false
}
const isLoud = (f, t) => loudness(f, t) > 0.5
function famPos(f) { if (f.walk) return { x: f.walk.x, z: f.walk.z }; return { x: f.spot.x, z: f.spot.z } }
function playerPos() { return posAt(G.s) }

// ---------- 3D
const cv = $('#cv')
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, S.pc ? 2 : 1.75))
const scene = new THREE.Scene(); scene.background = new THREE.Color('#070a1a')
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 120)
const hemi = new THREE.HemisphereLight(0x8a9ae0, 0x2a2848, 1.7); scene.add(hemi)
const moon = new THREE.DirectionalLight(0xb8ccff, 1.9); moon.position.set(-4, 10, -8); scene.add(moon)
const tvLight = new THREE.PointLight(0x6fa8ff, 6, 9, 1.4); tvLight.position.set(5.6, 1.2, 2.4); scene.add(tvLight)
const fridgeLight = new THREE.PointLight(0xfff0c0, 0, 11, 1.1); fridgeLight.position.set(12.5, 1.3, -1.9); scene.add(fridgeLight)
const roomLight = new THREE.PointLight(0xffe6c0, 0, 18, 0.8); roomLight.position.set(0, 4, 0); scene.add(roomLight)
const heroLight = new THREE.PointLight(0xffe0c8, 2.2, 4.5, 1.2); scene.add(heroLight) // 主人公を少しだけ照らす（暗くて表情が見えないのを防ぐ）

const MATS = {}
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); return MATS[k] || (MATS[k] = new THREE.MeshLambertMaterial({ color: c, ...o })) }
const box = (w, h, d, c, x, y, z, parent = scene, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c, o) : c); m.position.set(x, y, z); parent.add(m); return m }
const cyl = (rt, rb, h, c, x, y, z, parent = scene, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'string' ? mat(c) : c); m.position.set(x, y, z); parent.add(m); return m }
const ball = (r, c, x, y, z, parent = scene, det = 1) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, det), typeof c === 'string' ? mat(c, { flatShading: true }) : c); m.position.set(x, y, z); parent.add(m); return m }
function canvasTex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep) } return t }

// 床・壁
const BACK = -3.6, FRONT = 3.3
const woodTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#8a6a4c'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < 8; i++) { x.fillStyle = ['#86664a', '#8f6f50', '#82624a', '#927252'][i % 4]; x.fillRect(0, i * 32, w, 31); x.fillStyle = '#5a4030'; x.fillRect(0, i * 32 + 31, w, 1.5); x.fillRect(((i * 97) % 200) + 20, i * 32, 1.5, 32) }
}, [3, 3])
const tileTex = canvasTex(128, 128, (x, w, h) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#d8d4c8' : '#a9b4c4'; x.fillRect(i * 32, j * 32, 32, 32) } }, [4, 4])
const carpetTex = canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#7b6aa8'; x.fillRect(0, 0, w, h); x.fillStyle = '#6f5f9c'; for (let i = 0; i < 64; i += 8) x.fillRect(0, i, 64, 3) }, [5, 5])
function floor(x0, x1, tex) { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, FRONT - BACK), new THREE.MeshLambertMaterial({ map: tex })); m.rotation.x = -PI / 2; m.position.set((x0 + x1) / 2, 0, (BACK + FRONT) / 2); scene.add(m) }
floor(-14.6, -9, carpetTex); floor(-9, -2, woodTex); floor(-2, 7, woodTex); floor(7, 13.9, tileTex)
// 床の厚み（ドールハウス感）
box(28.6, 0.5, 7.0, '#2a2440', -0.35, -0.26, -0.15)
const WALL = '#bdb6d6', WALL2 = '#a99fc8'
box(28.6, 2.8, 0.2, WALL, -0.35, 1.4, BACK - 0.1)
box(0.2, 0.55, 7.0, WALL2, -14.7, 0.275, -0.15); box(0.2, 2.8, 7.0, WALL2, 14.0, 1.4, -0.15)
// 仕切り（奥は高く、手前は低く切ってある）
for (const px of [-9, -2]) { box(0.16, 0.55, -0.8 - BACK, WALL2, px, 0.275, (BACK - 0.8) / 2); box(0.16, 0.55, FRONT - 1.4, WALL2, px, 0.275, (1.4 + FRONT) / 2); for (const pz of [-0.8, 1.4]) box(0.12, 2.2, 0.12, '#7d72a3', px, 1.1, pz) }
box(0.16, 0.55, 1.0, WALL2, 7, 0.275, BACK + 0.5)
// 巾木
box(28.6, 0.12, 0.05, '#6c5a8c', -0.35, 0.06, BACK + 0.02)
// 窓と月明かり
const shaftTex = canvasTex(64, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(190,215,255,0.55)'); g.addColorStop(1, 'rgba(190,215,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h) })
const patchTex = canvasTex(64, 64, (x, w, h) => { x.fillStyle = 'rgba(200,220,255,0.5)'; x.fillRect(4, 4, 27, 27); x.fillRect(33, 4, 27, 27); x.fillRect(4, 33, 27, 27); x.fillRect(33, 33, 27, 27) })
function windowAt(wx) {
  box(1.5, 1.2, 0.06, new THREE.MeshBasicMaterial({ color: '#1d3570' }), wx, 1.7, BACK + 0.02)
  box(1.6, 0.08, 0.1, '#e8e4f4', wx, 2.32, BACK + 0.05); box(1.6, 0.08, 0.1, '#e8e4f4', wx, 1.08, BACK + 0.05)
  box(0.06, 1.2, 0.08, '#e8e4f4', wx, 1.7, BACK + 0.05); box(1.5, 0.05, 0.08, '#e8e4f4', wx, 1.7, BACK + 0.05)
  // 月（外に見える）
  // カーテン
  box(0.3, 1.5, 0.08, '#3d4f8f', wx - 0.95, 1.65, BACK + 0.08); box(0.3, 1.5, 0.08, '#3d4f8f', wx + 0.95, 1.65, BACK + 0.08)
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.0), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55 }))
  sh.position.set(wx + 0.3, 1.0, BACK + 1.3); sh.rotation.x = -0.95; scene.add(sh)
  const pt = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }))
  pt.rotation.x = -PI / 2; pt.position.set(wx + 0.5, 0.012, BACK + 2.5); scene.add(pt)
}
for (const wx of [-11.6, -5.0, 0.2, 4.4, 9.2]) windowAt(wx)
// 夜空の月（窓の奥）
{ const m = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), new THREE.MeshBasicMaterial({ color: '#fff3c4' })); m.position.set(4.7, 2.0, BACK - 0.0); scene.add(m) }

// 家具
// 自分の部屋
box(1.2, 0.4, 2.2, '#5a4a80', -13.4, 0.2, -2.3); box(1.15, 0.18, 2.1, '#f2d6e6', -13.4, 0.48, -2.3); box(1.0, 0.16, 0.5, '#ffffff', -13.4, 0.62, -3.1)
box(1.1, 0.12, 1.3, '#ff9ec4', -13.4, 0.6, -1.95) // 掛け布団
box(1.3, 0.08, 0.6, '#9c7a56', -10.6, 0.75, -3.15); box(0.08, 0.75, 0.55, '#7a5a40', -11.2, 0.37, -3.15); box(0.08, 0.75, 0.55, '#7a5a40', -10.0, 0.37, -3.15)
box(0.5, 0.35, 0.05, new THREE.MeshBasicMaterial({ color: '#2a3c70' }), -10.6, 1.0, -3.3) // ノートPC
{ const p = box(0.6, 0.9, 0.04, '#ffe9a8', -12.0, 2.0, BACK + 0.03) } // 体重グラフのポスター
// 廊下
box(2.4, 0.12, 1.0, '#3d6b8f', -5.6, 0.06, -2.35) // 姉の布団
box(0.9, 1.6, 0.4, '#6a5a8a', -8.2, 0.8, -3.3); box(0.5, 0.5, 0.05, '#ffe0a0', -3.4, 1.7, BACK + 0.03)
// リビング
box(2.8, 0.42, 0.9, '#476a9a', 2.6, 0.21, -2.85); box(2.8, 0.6, 0.25, '#3c5a86', 2.6, 0.62, -3.25); box(0.25, 0.6, 0.9, '#3c5a86', 1.1, 0.42, -2.85); box(0.25, 0.6, 0.9, '#3c5a86', 4.1, 0.42, -2.85)
{ const r = new THREE.Mesh(new THREE.CircleGeometry(1.7, 20), mat('#a85a6a')); r.rotation.x = -PI / 2; r.position.set(2.6, 0.01, -0.3); r.scale.set(1.3, 1, 1); scene.add(r) }
box(1.2, 0.08, 0.7, '#9c7a56', 4.7, 0.36, -0.7); box(1.0, 0.32, 0.5, '#7a5a40', 4.7, 0.16, -0.7)
box(1.6, 0.5, 0.5, '#4a3f62', 5.6, 0.25, 3.0); const tvScreen = box(1.5, 0.85, 0.06, new THREE.MeshBasicMaterial({ color: '#4f86ff' }), 5.6, 0.95, 2.86); box(1.6, 0.95, 0.1, '#1a1830', 5.6, 0.95, 2.93)
cyl(0.18, 0.14, 0.4, '#c97a5a', -1.4, 0.2, -3.1); ball(0.4, '#3f8a5a', -1.4, 0.75, -3.1)
// 台所
box(3.2, 0.9, 0.7, '#d8d0e8', 9.2 - 0.6, 0.45, -3.2); box(3.2, 0.06, 0.75, '#8c8aa6', 9.2 - 0.6, 0.92, -3.2) // 流し台
box(1.6, 0.06, 1.0, '#c49a6c', 9.8, 0.75, -2.45); for (const [dx, dz] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) box(0.06, 0.75, 0.06, '#8a6a4a', 9.8 + dx, 0.37, -2.45 + dz) // テーブル
box(0.5, 0.06, 0.5, '#8a6a4a', 9.8, 0.48, -3.15); box(0.5, 0.7, 0.06, '#8a6a4a', 9.8, 0.85, -3.42) // 母のいす
box(0.4, 0.02, 0.3, '#ffffff', 9.5, 0.79, -2.3); box(0.1, 0.1, 0.1, '#ff6a6a', 10.2, 0.83, -2.2) // 家計簿と電卓
{ const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.18, 16), mat('#b0543c')); b.position.set(6.3, 0.09, -2.6); scene.add(b) } // 犬のベッド
// 冷蔵庫
const FR = { x: 12.5, z: -3.05, w: 1.2, h: 2.1, d: 0.9 }
const fridge = new THREE.Group(); fridge.position.set(FR.x, 0, FR.z); scene.add(fridge)
box(FR.w, FR.h, FR.d, '#e4ecf6', 0, FR.h / 2, 0, fridge)
const fIn = box(FR.w - 0.12, FR.h - 0.5, 0.05, new THREE.MeshBasicMaterial({ color: '#7d8698' }), 0, 0.95, FR.d / 2 + 0.005, fridge)
const shelves = []; for (const y of [0.55, 1.05, 1.5]) shelves.push(box(FR.w - 0.16, 0.03, 0.05, new THREE.MeshBasicMaterial({ color: '#c8d0dc' }), 0, y, FR.d / 2 + 0.03, fridge))
const doorPivot = new THREE.Group(); doorPivot.position.set(FR.w / 2, 0, FR.d / 2); fridge.add(doorPivot)
box(FR.w, FR.h - 0.45, 0.1, '#f0f4fa', -FR.w / 2, (FR.h - 0.45) / 2 + 0.02, 0.05, doorPivot)
box(0.06, 0.6, 0.06, '#9aa4b8', -FR.w + 0.12, 1.0, 0.13, doorPivot)
box(FR.w, 0.42, 0.1, '#f0f4fa', 0, FR.h - 0.22, FR.d / 2 + 0.05, fridge); box(0.5, 0.05, 0.06, '#9aa4b8', -0.2, FR.h - 0.32, FR.d / 2 + 0.12, fridge)
// 冷蔵庫の扉に貼られたメモ（ダイエット中！）
box(0.3, 0.3, 0.01, '#ffe066', -0.75, 1.35, 0.11, doorPivot)
const beamTex = canvasTex(64, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,240,190,0.9)'); g.addColorStop(1, 'rgba(255,240,190,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h) })
const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.6), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, side: THREE.DoubleSide }))
beam.rotation.x = -PI / 2; beam.position.set(FR.x - 0.3, 0.02, FR.z + 2.7); scene.add(beam)

// 道の上の物
const hazMesh = []
for (const h of HAZ) {
  if (h.id === 'board') { const m = box(0.9, 0.025, 0.45, '#c08a50', h.x, 0.013, h.z); box(0.5, 0.03, 0.03, '#4a2a1a', h.x, 0.02, h.z, scene); hazMesh.push(m) }
  else { const g = new THREE.Group(); g.position.set(h.x, 0, h.z); scene.add(g); ball(0.16, '#ffd23f', 0, 0.14, 0, g); ball(0.1, '#ffd23f', 0.1, 0.32, 0, g); box(0.1, 0.04, 0.08, '#ff8a30', 0.22, 0.31, 0, g); ball(0.025, '#16122a', 0.15, 0.36, 0.06, g, 0); hazMesh.push(g); h.mesh = g; h.home = [h.x, h.z] }
}

// ---------- 顔（Canvas）
function faceCanvas() { const c = document.createElement('canvas'); c.width = c.height = 128; return c }
function drawFace(c, who, ex) {
  const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128); x.lineCap = x.lineJoin = 'round'; x.strokeStyle = x.fillStyle = '#1a1020'; x.lineWidth = 7
  const E = [40, 88], ey = 58
  const shut = () => { for (const cx of E) { x.beginPath(); x.arc(cx, ey - 6, 11, 0.2 * PI, 0.8 * PI); x.stroke() } }
  const happy = () => { for (const cx of E) { x.beginPath(); x.arc(cx, ey + 6, 11, 1.2 * PI, 1.8 * PI); x.stroke() } }
  const open = (r = 8, dx = 0, white) => { for (const cx of E) { if (white) { x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, ey, r + 6, 0, 7); x.fill(); x.stroke() } x.fillStyle = '#1a1020'; x.beginPath(); x.arc(cx + dx, ey, r, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + dx - r * 0.35, ey - r * 0.35, r * 0.3, 0, 7); x.fill() } x.fillStyle = '#1a1020' }
  const blush = (a = 0.55) => { x.fillStyle = `rgba(255,110,140,${a})`; for (const cx of [26, 102]) { x.beginPath(); x.ellipse(cx, 80, 13, 8, 0, 0, 7); x.fill() } x.fillStyle = '#1a1020' }
  const sweat = () => { x.fillStyle = '#7fd0ff'; x.strokeStyle = '#1a1020'; x.lineWidth = 3; x.beginPath(); x.moveTo(112, 22); x.quadraticCurveTo(124, 42, 112, 46); x.quadraticCurveTo(100, 42, 112, 22); x.fill(); x.stroke(); x.lineWidth = 7; x.fillStyle = '#1a1020' }
  switch (ex) {
    case 'sleep': shut(); x.beginPath(); x.arc(64, 94, 6, 0, 7); x.stroke(); break
    case 'snore': shut(); x.fillStyle = '#6a1a2a'; x.beginPath(); x.ellipse(64, 96, 13, 15, 0, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#9fd8ff'; x.beginPath(); x.ellipse(78, 112, 4, 8, 0, 0, 7); x.fill(); break
    case 'hmm': x.beginPath(); x.moveTo(28, ey); x.lineTo(52, ey - 2); x.stroke(); x.beginPath(); x.arc(E[1], ey - 6, 11, 0.2 * PI, 0.8 * PI); x.stroke(); x.beginPath(); x.moveTo(50, 96); x.quadraticCurveTo(57, 88, 64, 96); x.quadraticCurveTo(71, 104, 78, 96); x.stroke(); break
    case 'awake': open(7); x.beginPath(); x.moveTo(52, 96); x.lineTo(76, 96); x.stroke(); break
    case 'angry': open(7); x.beginPath(); x.moveTo(24, 36); x.lineTo(52, 46); x.moveTo(104, 36); x.lineTo(76, 46); x.stroke(); x.beginPath(); x.arc(64, 108, 14, 1.15 * PI, 1.85 * PI); x.stroke(); break
    case 'sneak': open(7, 5); x.beginPath(); x.moveTo(50, 96); x.lineTo(78, 94); x.stroke(); sweat(); break
    case 'scared': open(5, 0, true); x.fillStyle = '#6a1a2a'; x.beginPath(); x.moveTo(46, 92); for (let i = 0; i <= 6; i++) x.lineTo(46 + i * 6, 92 + (i % 2 ? -5 : 5)); x.lineTo(82, 108); x.lineTo(46, 108); x.closePath(); x.fill(); x.stroke(); sweat(); break
    case 'happy': happy(); x.fillStyle = '#6a1a2a'; x.beginPath(); x.arc(64, 88, 16, 0, PI); x.closePath(); x.fill(); x.stroke(); blush(); break
    case 'eat': happy(); x.beginPath(); x.moveTo(52, 94); x.quadraticCurveTo(58, 102, 64, 94); x.quadraticCurveTo(70, 102, 76, 94); x.stroke(); blush(0.75); break
    case 'grin': open(9); x.fillStyle = '#ffe066'; for (const cx of E) { x.beginPath(); x.arc(cx + 3, ey - 3, 3.5, 0, 7); x.fill() } x.fillStyle = '#6a1a2a'; x.beginPath(); x.arc(64, 86, 18, 0, PI); x.closePath(); x.fill(); x.stroke(); x.fillStyle = '#9fd8ff'; x.beginPath(); x.ellipse(84, 108, 4, 9, 0, 0, 7); x.fill(); blush(); break
  }
  x.fillStyle = '#1a1020'; x.strokeStyle = '#1a1020'
  if (who === 'dad') { x.lineWidth = 9; x.beginPath(); x.moveTo(44, 80); x.quadraticCurveTo(64, 70, 84, 80); x.stroke() }
  if (who === 'mom') { x.lineWidth = 3; for (const cx of E) for (const d of [-8, 0, 8]) { x.beginPath(); x.moveTo(cx + d, ey - 14); x.lineTo(cx + d * 1.4, ey - 20); x.stroke() } }
  if (who === 'sister' && ex !== 'angry') { x.fillStyle = 'rgba(255,110,140,.45)'; for (const cx of [26, 102]) { x.beginPath(); x.ellipse(cx, 80, 11, 6, 0, 0, 7); x.fill() } }
  if (who === 'dog') { x.fillStyle = '#1a1020'; x.beginPath(); x.moveTo(52, 74); x.lineTo(76, 74); x.lineTo(64, 86); x.closePath(); x.fill() }
}

// ---------- 人
const SKIN = '#f6cfb0'
function stripeTex(a, b) { return canvasTex(32, 32, (x) => { x.fillStyle = a; x.fillRect(0, 0, 32, 32); x.fillStyle = b; x.fillRect(0, 0, 32, 8); x.fillRect(0, 16, 32, 8) }, [2, 3]) }
function makePerson(o) {
  const root = new THREE.Group(), upper = new THREE.Group(), headG = new THREE.Group()
  const top = o.tex ? new THREE.MeshLambertMaterial({ map: o.tex }) : mat(o.top), bottom = o.texB ? new THREE.MeshLambertMaterial({ map: o.texB }) : mat(o.bottom)
  const tw = o.wide || 1
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27 * tw, 0.3, 4, 10), top); torso.position.y = 0.36; torso.scale.set(1, 1, 0.85); upper.add(torso)
  headG.position.y = 0.72; upper.add(headG)
  const head = ball(0.27, SKIN, 0, 0.26, 0, headG, 2)
  const fc = faceCanvas(), ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: ftex, transparent: true, depthWrite: false })); face.position.set(0, 0.25, 0.262); headG.add(face)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 6, 0, PI * 2, 0, PI * (o.hairCut || 0.5)), mat(o.hair)); hair.position.set(0, 0.28, -0.03); hair.rotation.x = -0.35; headG.add(hair)
  if (o.style === 'bun') ball(0.12, o.hair, 0, 0.5, -0.18, headG)
  if (o.style === 'pony') { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.25, 3, 6), mat(o.hair)); p.position.set(0, 0.2, -0.3); p.rotation.x = 0.5; headG.add(p) }
  if (o.style === 'cap') { const c = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 8), top); c.position.set(0, 0.6, -0.08); c.rotation.x = -0.6; headG.add(c); ball(0.07, '#ffffff', 0, 0.78, -0.3, headG) }
  // 鼻ちょうちん
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#cfeeff', transparent: true, opacity: 0.6, depthWrite: false })); bubble.position.set(0.07, 0.2, 0.31); headG.add(bubble); bubble.visible = false
  const arm = side => { const g = new THREE.Group(); g.position.set(side * 0.31 * tw, 0.58, 0); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.32, 3, 6), top); m.position.y = -0.2; g.add(m); ball(0.085, SKIN, 0, -0.42, 0, g); upper.add(g); return g }
  const leg = side => { const g = new THREE.Group(); g.position.set(side * 0.13, 0, 0); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.32, 3, 6), bottom); m.position.y = -0.24; g.add(m); box(0.17, 0.08, 0.26, o.shoe || '#e8e4f4', 0, -0.5, 0.05, g); root.add(g); return g }
  root.add(upper)
  const P = { root, upper, headG, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1), fc, ftex, face, bubble, ex: '', who: o.who, scale: o.scale || 1 }
  root.scale.setScalar(P.scale)
  P.setFace = ex => { if (P.ex === ex) return; P.ex = ex; drawFace(fc, o.who, ex); ftex.needsUpdate = true }
  P.setFace(o.face || 'sleep')
  return P
}
function makeDog() {
  const root = new THREE.Group(), upper = new THREE.Group(), headG = new THREE.Group()
  const fur = mat('#d8a060'), dark = mat('#8a5a30')
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 8), fur); body.rotation.x = PI / 2; body.position.set(0, 0.24, 0); root.add(body)
  upper.position.set(0, 0.28, 0.32); root.add(upper); upper.add(headG)
  ball(0.21, '#d8a060', 0, 0.06, 0.08, headG, 1); ball(0.1, '#f0d0a0', 0, 0.0, 0.26, headG, 1)
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 4), dark); e.position.set(s * 0.13, 0.25, 0.04); e.rotation.z = -s * 0.3; headG.add(e) }
  const fc = faceCanvas(), ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: ftex, transparent: true, depthWrite: false })); face.position.set(0, 0.06, 0.3); headG.add(face)
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 3, 5), dark); tail.position.set(0.05, 0.32, -0.42); tail.rotation.x = -0.8; root.add(tail)
  for (const [x, z] of [[-0.14, 0.25], [0.14, 0.25], [-0.14, -0.25], [0.14, -0.25]]) ball(0.07, '#d8a060', x, 0.06, z, root, 0)
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: '#cfeeff', transparent: true, opacity: 0.6, depthWrite: false })); bubble.position.set(0.06, 0.02, 0.38); headG.add(bubble); bubble.visible = false
  const P = { root, upper, headG, fc, ftex, face, bubble, tail, ex: '', who: 'dog', dog: true, scale: 1.15 }
  root.scale.setScalar(P.scale)
  P.setFace = ex => { if (P.ex === ex) return; P.ex = ex; drawFace(fc, 'dog', ex); ftex.needsUpdate = true }
  P.setFace('sleep')
  return P
}
// 主人公（パジャマのダイエット中の人）
const pj = stripeTex('#ffb3c9', '#ffffff')
const hero = makePerson({ who: 'me', tex: pj, texB: pj, hair: '#3a2a20', style: 'cap', wide: 1.3, scale: 1.0, shoe: '#ff8fb1', face: 'sneak' })
scene.add(hero.root)
const stack = new THREE.Group(); stack.position.set(0, 1.42, 0.05); stack.scale.setScalar(1.35); hero.upper.add(stack)
const handItem = new THREE.Group(); hero.armR.add(handItem); handItem.position.set(0, -0.5, 0.05); handItem.rotation.x = 1.9 // 腕の角度ぶん戻してプリンを立てる
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })); blob.rotation.x = -PI / 2; blob.position.y = 0.015; scene.add(blob)

// 家族
const famMesh = {
  sister: makePerson({ who: 'sister', top: '#9b7bd6', bottom: '#7a5ab8', hair: '#5a3a2a', style: 'pony', scale: 0.95 }),
  dad: makePerson({ who: 'dad', top: '#5a8ac0', bottom: '#3e5f88', hair: '#2a2a30', hairCut: 0.32, wide: 1.25, scale: 1.12 }),
  dog: makeDog(),
  mom: makePerson({ who: 'mom', top: '#e07a9a', bottom: '#b45a78', hair: '#4a2a1a', style: 'bun', scale: 1.04 }),
}
const holders = {}, blankets = {}
for (const [id, P] of Object.entries(famMesh)) { const h = new THREE.Group(); scene.add(h); h.add(P.root); holders[id] = h }
blankets.sister = box(0.8, 0.14, 1.1, '#e8b4d8', 0, 0, 0, holders.sister)
blankets.dad = box(0.75, 0.12, 0.9, '#d8c890', 0, 0, 0, holders.dad)

// 食べ物
function makeItem(id) {
  const g = new THREE.Group(); let h = 0.3
  switch (id) {
    case 'pudding': cyl(0.13, 0.1, 0.2, '#ffd23f', 0, 0.1, 0, g, 12); cyl(0.1, 0.13, 0.05, '#8a4b1c', 0, 0.22, 0, g, 12); cyl(0.17, 0.17, 0.02, '#dbe8ff', 0, 0.01, 0, g, 12); h = 0.25; break
    case 'karaage': for (const [x, y, z] of [[-0.07, 0.08, 0], [0.08, 0.08, 0.03], [0, 0.08, -0.08], [0, 0.18, 0]]) ball(0.08, '#b8641e', x, y, z, g, 0); box(0.36, 0.03, 0.3, '#ffffff', 0, 0.015, 0, g); h = 0.26; break
    case 'cheesecake': { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10, 1, false, 0, PI * 1.6), mat('#ffe9a0')); m.position.y = 0.07; g.add(m); h = 0.15; break }
    case 'yogurt': cyl(0.1, 0.09, 0.16, '#ffffff', 0, 0.08, 0, g, 10); cyl(0.105, 0.105, 0.015, '#ff8fb1', 0, 0.165, 0, g, 10); h = 0.18; break
    case 'beer': cyl(0.07, 0.07, 0.24, '#d8b040', 0, 0.12, 0, g, 10); cyl(0.06, 0.07, 0.03, '#c8c8d0', 0, 0.25, 0, g, 10); h = 0.27; break
    case 'cake': cyl(0.22, 0.22, 0.18, '#fff6f0', 0, 0.09, 0, g, 14); for (let i = 0; i < 6; i++) ball(0.04, '#e8304a', Math.cos(i) * 0.15, 0.2, Math.sin(i) * 0.15, g, 0); h = 0.22; break
  }
  g.userData.h = h; return g
}
const shelfItems = D.ITEMS.map((it, i) => { const m = makeItem(it.id); const y = [0.57, 0.57, 1.07, 1.07, 1.52, 1.52][i]; m.position.set(i % 2 ? 0.25 : -0.25, y, -0.05); m.scale.setScalar(0.9); fridge.add(m); return m })

// Z の粒（いびき）
const zTex = canvasTex(64, 64, (x) => { x.font = "900 54px sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 8; x.strokeStyle = '#16122a'; x.strokeText('Z', 32, 34); x.fillStyle = '#e6f9ff'; x.fillText('Z', 32, 34) })
const zPool = []; for (let i = 0; i < 28; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); zPool.push({ s, life: 0 }) }
function spawnZ(x, y, z, big) { const p = zPool.find(p => p.life <= 0); if (!p) return; p.life = 1.6; p.x = x; p.y = y; p.z = z; p.vx = 0.25 + Math.random() * 0.2; p.big = big; p.s.visible = true }
// キラキラ（食べる場面）
const sparkTex = canvasTex(64, 64, (x) => { x.fillStyle = '#ffe066'; x.strokeStyle = '#16122a'; x.lineWidth = 4; x.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 10 : 28, a = i * PI / 4 - PI / 2; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r) } x.closePath(); x.fill(); x.stroke() })
const sparks = []; for (let i = 0; i < 10; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false })); s.visible = false; s.scale.setScalar(0.3); scene.add(s); sparks.push(s) }

// ---------- 置き方（ポーズ）
function poseSleep(id) {
  const P = famMesh[id], H = holders[id], sp = SPOTS[id]
  H.position.set(sp.x, 0, sp.z); H.rotation.set(0, sp.ry, 0)
  P.root.rotation.set(0, 0, 0); P.root.position.set(0, 0, 0); P.upper.rotation.set(0, 0, 0); P.headG.rotation.set(0, 0, 0)
  if (P.dog) { P.root.position.y = 0; P.upper.position.y = 0.2; P.headG.rotation.x = 0.35; return }
  for (const l of [P.legL, P.legR]) l.rotation.set(0, 0, 0)
  for (const a of [P.armL, P.armR]) a.rotation.set(0, 0, 0)
  if (sp.pose === 'futon' || sp.pose === 'sofa') {
    const y = sp.pose === 'sofa' ? 0.62 : 0.24
    P.root.rotation.x = -PI / 2; P.root.position.set(0, y, 0.15)
    P.armL.rotation.z = -0.2; P.armR.rotation.set(-2.6, 0, 0.3) // 片手をばんざい
    const b = blankets[id]; b.position.set(0, y + 0.05, 0.55); b.rotation.set(0, 0, 0); b.visible = true
  } else if (sp.pose === 'chair') {
    P.root.position.set(0, 0.55, 0); P.legL.rotation.x = P.legR.rotation.x = -PI / 2
    P.upper.rotation.x = -0.4; P.headG.rotation.x = -0.5; P.armL.rotation.set(0, 0, -0.25); P.armR.rotation.set(0, 0, 0.25)
  }
}
function poseStand(P, x, z, ry) {
  const H = P === hero ? null : Object.entries(famMesh).find(([, v]) => v === P)
  const target = H ? holders[H[0]] : null
  if (target) { target.position.set(x, 0, z); target.rotation.set(0, ry, 0); P.root.position.set(0, 0, 0) } else { P.root.position.set(x, 0, z) }
  P.root.rotation.set(0, target ? 0 : ry, 0); P.upper.rotation.set(0, 0, 0); P.headG.rotation.set(0, 0, 0)
  if (P.dog) { P.root.position.y = 0; P.upper.position.y = 0.42; P.headG.rotation.x = -0.25; return }
  P.root.position.y = 0.54 * P.scale
  for (const l of [P.legL, P.legR]) l.rotation.set(0, 0, 0); for (const a of [P.armL, P.armR]) a.rotation.set(0, 0, 0)
  if (blankets[H?.[0]]) blankets[H[0]].visible = false
}

// ---------- ゲームの進行（固定60Hz）
function famUpdate(f, dt, pp) {
  const P = famMesh[f.id], fp = famPos(f), d = Math.hypot(pp.x - fp.x, pp.z - fp.z)
  const L = loudness(f, G.t), loud = L > 0.5
  f.L = L; f.d = d
  if (f.hmmT > 0) f.hmmT -= dt
  if (f.state === 'sleep') {
    if (loud && !f.wasLoud) { if (!G.sim && G.phase === 'play') Snd.snore(f.id, clamp(1 - d / 10, 0, 1) * (f.id === 'dad' ? 1.2 : 0.9), segLeft(f)) }
    if (!loud && f.wasLoud && !G.sim && G.phase === 'play') { const sg = f.segs.find(q => q[1] <= G.t && G.t - q[1] < 0.1); if (sg && sg[3] && d < f.r + 2) { Snd.sfx('snort'); f.apT = 0.9 } }
    if (f.apT > 0) f.apT -= dt
    f.wasLoud = loud
    if (W.god) f.g = 0
    else if (G.acting && d < f.r) f.g += (loud ? 3 : TUNE.rate * f.k * (1 - 0.45 * d / f.r)) * dt
    else f.g = Math.max(0, f.g - TUNE.decay * dt)
    if (!W.god && G.door > 0.3 && (f.id === 'mom' || f.id === 'dog')) f.g += (loud ? 9 : TUNE.light) * G.door * dt
    if (f.g >= 50 && !f.turned) { f.turned = true; f.turnAnim = 1.2; f.hmmT = 1.3; G.turns++; if (!G.sim) { Snd.sfx('hmm', f.id === 'dad' ? 0.7 : f.id === 'sister' ? 1.4 : 1); } }
    if (f.g < 25) f.turned = false
    if (f.g >= 100) { f.state = 'look'; f.wakeN++; G.wakes++; f.lookT = 2.2 + 0.7 * (f.wakeN - 1); f.look0 = f.lookT; f.g = 100; if (!G.sim) { Snd.sfx('wake', f.id === 'dad' ? 0.7 : f.id === 'sister' ? 1.4 : 1); fx(fp.x, 1.6, fp.z, '!?', 'big red') } }
  } else if (f.state === 'look') {
    f.lookT -= dt
    // 起き上がる途中（TUNE.grace 秒）は見逃す。指を離す猶予
    if (G.acting && d < f.r * 1.5 && f.look0 - f.lookT > TUNE.grace) return caught(f.id)
    if (f.lookT <= 0) { f.state = 'sleep'; f.g = 38; f.turned = true; f.wasLoud = true }
  } else if (f.state === 'walk') {
    const w = f.walk
    if (w.wait > 0) w.wait -= dt
    else if (G.hugT <= 0) { w.z += w.v * dt; if (w.z > DAD_WALK.z1 || w.z < DAD_WALK.z0) { w.z = clamp(w.z, DAD_WALK.z0, DAD_WALK.z1); w.v = -w.v; w.wait = 0.9 } }
    if (G.hugCd > 0) G.hugCd -= dt
    if (d < 0.8 && G.hugT <= 0 && G.hugCd <= 0) {
      G.hugT = 2.3; G.hugCd = 3.5
      if (!G.sim) { Snd.sfx('hug'); fx(fp.x, 2.0, fp.z, T('hug'), ''); fx(pp.x - 0.5, 1.7, pp.z + 0.4, T('hugMe'), 'red') }
      for (const o of G.fam) if (o !== f && o.state === 'sleep') { const q = famPos(o); if (Math.hypot(q.x - pp.x, q.z - pp.z) < o.r * 1.3) o.g += 30 }
    }
  }
  if (f.turnAnim > 0) f.turnAnim -= dt
}
function segLeft(f) { for (const [a, b] of f.segs) if (G.t >= a && G.t <= b) return b - G.t; return 1 }
function noiseAt(h, kind) {
  if (!G.sim) { Snd.sfx(kind === 'toy' ? 'squeak' : 'creak'); fx(h.x, 0.9, h.z, T(kind === 'toy' ? 'toy' : 'creak'), 'big') }
  for (const f of G.fam) {
    const q = famPos(f), d = Math.hypot(q.x - h.x, q.z - h.z); if (d > f.r * 1.3) continue
    if (f.state === 'look') return caught(f.id)
    if (f.state === 'sleep') f.g += isLoud(f, G.t) ? 8 : kind === 'toy' ? 58 : 46
  }
}
function update(dt) {
  W.time += dt
  if (!G) return
  if (G.phase === 'play') playUpdate(dt)
  else if (G.phase === 'title') { G.t += dt; for (const f of G.fam) f.L = loudness(f, G.t) }
  else if (G.phase === 'caught' || G.phase === 'eat' || G.phase === 'result') { G.sceneT += dt; if (G.phase !== 'result' && G.sceneT > (G.phase === 'eat' ? 4.4 : 3.8) && !G.sim) showResult() }
  for (const p of zPool) if (p.life > 0) { p.life -= dt; p.y += dt * 0.55; p.x += p.vx * dt; const k = p.life / 1.6; p.s.position.set(p.x + Math.sin(p.life * 5) * 0.08, p.y, p.z); p.s.scale.setScalar((p.big ? 0.42 : 0.26) * (1.3 - k * 0.5)); p.s.material.opacity = Math.min(1, k * 2); if (p.life <= 0) p.s.visible = false }
}
function playUpdate(dt) {
  if (W.bot) G.held = botWants(1)
  G.t += dt
  const pp = playerPos()
  G.acting = false; G.moving = false
  if (G.hugT > 0) G.hugT -= dt
  if (G.sub === 'walk' && G.hugT <= 0 && G.held) {
    const sp = TUNE.speed * (G.dir < 0 ? 1 - 0.06 * (G.items - 1) : 1)
    const prev = G.s; G.s = clamp(G.s + G.dir * sp * dt, 0, LEN); G.moving = G.acting = true
    for (const h of HAZ) { if ((prev - h.s) * (G.s - h.s) <= 0 && prev !== h.s) { if (h.id === 'toy' && h.kicked) continue; if (h.id === 'toy') { h.kicked = true; if (!G.sim) h.kick = 1 } noiseAt(h, h.id); if (G.phase !== 'play') return } }
    if (!G.sim) { G.stepT += dt; if (G.stepT > 0.32) { G.stepT = 0; Snd.sfx('step', 0.8) } }
    if (G.dir > 0 && G.s >= LEN) { G.sub = 'fridge' }
    if (G.dir < 0 && G.s <= 0) return success()
  } else if (G.sub === 'fridge') {
    if (G.held) {
      G.acting = true
      if (G.door < 1) { const was = G.door; G.door = Math.min(1, G.door + dt * 0.9); if (was === 0 && !G.sim) { Snd.sfx('door'); fx(FR.x, 2.3, FR.z + 0.6, T('door'), 'big') } if (G.door >= 1 && !G.lit) { G.lit = true; if (!G.sim) { Snd.sfx('light'); flash() } } }
      else if (G.items < MAXI) { G.grabT += dt; if (G.grabT >= 0.62) { G.grabT = 0; grab() } }
      else G.acting = false
    } else if (G.items >= 1) { G.sub = 'close' }
    else if (G.door > 0) { G.door = Math.max(0, G.door - dt * 0.5); if (G.door < 1) G.lit = false } // 手を離すと扉は少しずつ閉まる
  } else if (G.sub === 'close') {
    G.door -= dt * 2.6
    if (G.door <= 0) { G.door = 0; G.dir = -1; G.sub = 'walk'; if (!G.sim) { Snd.sfx('close'); fx(FR.x, 1.8, FR.z + 0.6, T('close'), '') } }
  }
  // 父の夢遊（帰り道）
  const dad = G.fam.find(f => f.id === 'dad')
  if (dad.state === 'sleep' && !dad.walk) { dad.state = 'walk'; dad.walk = { x: DAD_WALK.x, z: DAD_WALK.z0 + G.r() * 3, v: TUNE.dadV * (G.r() < 0.5 ? 1 : -1), wait: 0 }; dad.g = 0 }
  for (const f of G.fam) { famUpdate(f, dt, pp); if (G.phase !== 'play') return }
  if (G.t >= D.DAWN) caught('dawn')
}
function grab() {
  const it = D.ITEMS[G.items], m = shelfItems[G.items]
  G.items++
  if (!G.sim) Snd.sfx('grab', G.items)
  fridge.remove(m); m.scale.setScalar(1); let y = 0; for (const c of stack.children) y += c.userData.h
  m.position.set((G.items % 2 ? 0.04 : -0.04), y, 0); m.rotation.set(0, G.items * 0.7, (G.items % 2 ? 0.08 : -0.08)); stack.add(m)
  if (!G.sim) { fx(FR.x - 0.4 + (G.items % 2 ? -1 : 1) * 0.9, 2.0 + (G.items % 3) * 0.35, FR.z + 1.0, (S.lang === 'ja' ? '' : '+') + (S.lang === 'ja' ? it.ja + '！' : it.en + '!'), G.items === 1 ? 'big' : ''); if (G.items >= MAXI) Snd.sfx('full') }
}
function caught(by) {
  if (G.phase !== 'play') return
  G.phase = 'caught'; G.scene = 'caught'; G.by = by; G.outcome = 'ng'; G.sceneT = 0; G.held = false
  if (G.sim) return
  Snd.setTrack(null); Snd.sfx(by === 'dawn' ? 'alarm' : 'caught'); setTimeout(() => Snd.setTrack('lose'), 1300)
  setupCaught(); go('vPlay'); $('#skipHint').hidden = false
}
function success() {
  G.phase = 'eat'; G.scene = 'eat'; G.outcome = 'ok'; G.sceneT = 0; G.held = false; G.time = G.t
  if (G.sim) return
  Snd.setTrack('win'); Snd.sfx('yay'); setupEat(); $('#skipHint').hidden = false
}

// ---------- 場面
function resetWorld() {
  for (const id of Object.keys(famMesh)) { poseSleep(id); famMesh[id].setFace('sleep'); famMesh[id].bubble.visible = true }
  for (const m of stack.children.slice()) stack.remove(m)
  shelfItems.forEach((m, i) => { m.scale.setScalar(0.9); m.position.set(i % 2 ? 0.25 : -0.25, [0.57, 0.57, 1.07, 1.07, 1.52, 1.52][i], -0.05); m.rotation.set(0, 0, 0); fridge.add(m) })
  for (const h of HAZ) { h.kicked = false; if (h.mesh) { h.mesh.position.set(h.home[0], 0, h.home[1]); h.mesh.rotation.set(0, 0, 0); h.kick = 0 } }
  for (const m of handItem.children.slice()) handItem.remove(m)
  roomLight.intensity = 0; hemi.intensity = 1.7; hemi.color.set(0x8a9ae0); scene.background.set('#070a1a'); fridgeLight.intensity = 0; beam.material.opacity = 0; doorPivot.rotation.y = 0
  for (const s of sparks) s.visible = false
  hero.root.visible = true; hero.setFace('sneak')
}
function setupCaught() {
  const pp = playerPos(), a = Math.atan2(pp.dx * G.dir, pp.dz * G.dir)
  roomLight.position.set(pp.x, 4, pp.z + 1); roomLight.intensity = 12; hemi.intensity = 1.9; scene.background.set('#2a2440')
  hero.setFace('scared')
  const cd = camDir(), fx0 = -cd.x, fz0 = -cd.z, fl = Math.hypot(fx0, fz0), fw = [fx0 / fl, fz0 / fl], rt = [-fw[1], fw[0]]
  W.caughtCenter = [clamp(pp.x, -13.4, 12.6) , clamp(pp.z, BACK + 1.6, FRONT - 1.0)]
  const [cx, cz] = W.caughtCenter
  W.heroFace = Math.atan2(-fw[0], -fw[1])
  const ring = [['mom', -0.75, 0.75], ['dad', 0.8, 0.85], ['sister', -1.45, 0.25], ['dog', 1.35, 0.15]]
  for (const [id, side, back] of ring) {
    const P = famMesh[id]
    const x = cx + rt[0] * side + fw[0] * back, z = cz + rt[1] * side + fw[1] * back
    poseStand(P, x, z, Math.atan2(cx - x, cz - z) * 0.5 + W.heroFace * 0.5); P.setFace(id === 'dog' ? 'awake' : 'angry'); P.bubble.visible = false
    if (!P.dog) { if (id === 'mom') { P.armL.rotation.set(0, 0, 0.9); P.armR.rotation.set(0, 0, -0.9) } if (id === 'sister') P.armR.rotation.set(-1.6, 0, 0) }
  }
  const lines = [['mom', 'caughtMom'], ['dad', 'caughtDad'], ['sister', 'caughtSis'], ['dog', 'caughtDog']]
  lines.sort((a, b) => (b[0] === G.by) - (a[0] === G.by))
  G.says = lines.map(([id, k], i) => ({ id, k, at: 0.25 + i * 0.4 }))
  if (G.by === 'dawn') { G.says.unshift({ id: 'clock', k: 'dawnMsg', at: 0 }); scene.background.set('#f0a070'); hemi.color.set('#ffd0a0') }
}
function setupEat() {
  hero.setFace('eat'); for (const s of sparks) s.visible = true
  // 主人公をベッドに座らせ、プリンを手に
  const pud = stack.children[0]; if (pud) { stack.remove(pud); pud.position.set(0, 0, 0); pud.rotation.set(0, 0, 0); handItem.add(pud) }
  let y = 0; stack.children.slice().forEach((m, i) => { stack.remove(m); m.position.set(-13.4 + 0.3 - (i % 2) * 0.35, 0.7, -1.5 - Math.floor(i / 2) * 0.35); m.rotation.y = i; scene.add(m); m.userData.loose = true })
}

// ---------- 見た目の更新（毎フレーム）
const W = { time: 0, paused: false, camPos: new THREE.Vector3(-8, 10, 12), camLook: new THREE.Vector3(-8, 0, 0), titleX: -11 }
function heroAnim(t) {
  const H = hero
  if (!G || G.phase === 'title') { H.root.position.set(-12.5, 0.54, -0.6); H.root.rotation.set(0, 0.5 + Math.sin(t * 0.7) * 0.4, 0); H.upper.rotation.set(0, 0, Math.sin(t * 2) * 0.03); H.armL.rotation.set(-0.4, 0, -0.3); H.armR.rotation.set(-1.9 + Math.sin(t * 3) * 0.2, 0, 0.2); H.legL.rotation.x = H.legR.rotation.x = 0; H.setFace('grin'); blob.position.set(-12.5, 0.015, -0.6); return }
  const pp = playerPos(), ph = G.phase === 'result' ? G.scene : G.phase
  if (ph === 'eat') {
    const cd = camDir(); H.root.position.set(-13.4, 0.48 + 0.04, -1.2); H.root.rotation.set(0, Math.atan2(cd.x, cd.z) * 0.8, 0); H.legL.rotation.x = H.legR.rotation.x = -PI / 2
    const k = G.sceneT; H.armR.rotation.set(-1.9 + Math.sin(k * 9) * 0.25, 0, 0.35); H.armL.rotation.set(-1.2, 0, -0.5); H.upper.rotation.set(0, 0, Math.sin(k * 4) * 0.07)
    H.setFace(Math.floor(k * 2.5) % 3 === 2 ? 'happy' : 'eat'); blob.position.set(-13.4, 0.015, -1.2)
    sparks.forEach((s, i) => { const a = i / sparks.length * PI * 2 + k * 1.3; s.position.set(-13.4 + Math.cos(a) * 1.0, 1.4 + Math.sin(k * 3 + i) * 0.25, -1.2 + Math.sin(a) * 0.6); s.scale.setScalar(0.22 + 0.1 * Math.abs(Math.sin(k * 5 + i))) })
    const ei = Math.floor(k * 2.5); if (ei !== W.eatI && !G.sim && k < 3.6) Snd.sfx('eat'); W.eatI = ei
    return
  }
  let ry = Math.atan2(pp.dx * G.dir, pp.dz * G.dir)
  if (G.sub === 'fridge' || G.sub === 'close') ry = PI
  if (W.heroRy != null) ry = W.heroRy
  const cur = H.root.rotation.y; let dr = ((ry - cur + PI * 3) % (PI * 2)) - PI
  H.root.rotation.set(0, cur + dr * 0.2, 0)
  const mv = G.moving && G.phase === 'play', w = W.time * 9
  const hug = G.hugT > 0
  H.root.position.set(pp.x + (mv ? 0 : Math.sin(W.time * 40) * 0.008), 0.54 + (mv ? Math.abs(Math.sin(w)) * 0.06 : 0), pp.z)
  blob.position.set(pp.x, 0.015, pp.z)
  { const cd = camDir(); heroLight.position.set(pp.x + cd.x * 1.6, 1.9, pp.z + cd.z * 1.6) }
  if (ph === 'caught') { const [cx, cz] = W.caughtCenter; H.root.position.set(cx, 0.54 + Math.abs(Math.sin(W.time * 18)) * 0.05, cz); H.root.rotation.set(0, W.heroFace, 0); blob.position.set(cx, 0.015, cz); H.armL.rotation.set(-2.8, 0, -0.5 + Math.sin(W.time * 20) * 0.2); H.armR.rotation.set(-2.8, 0, 0.5 - Math.sin(W.time * 20) * 0.2); H.legL.rotation.x = 0.2; H.legR.rotation.x = -0.2; H.upper.rotation.set(-0.15, 0, Math.sin(W.time * 25) * 0.05); return }
  H.upper.rotation.set(mv ? 0.12 : 0.05, 0, hug ? Math.sin(W.time * 20) * 0.12 : 0)
  if (G.items > 0) { H.armL.rotation.set(-2.9, 0, -0.25); H.armR.rotation.set(-2.9, 0, 0.25); stack.rotation.z = (mv ? Math.sin(w * 0.5) * 0.06 : 0) }
  else { H.armL.rotation.set(-1.3 + (mv ? Math.sin(w) * 0.2 : 0), 0, -0.4); H.armR.rotation.set(-1.0 - (mv ? Math.sin(w) * 0.2 : 0), 0, 0.5) }
  H.legL.rotation.x = mv ? Math.sin(w) * 0.55 : 0.25; H.legR.rotation.x = mv ? -Math.sin(w) * 0.55 : -0.15
  const anyLook = G.fam.some(f => f.state === 'look')
  H.setFace(hug || anyLook ? 'scared' : (G.sub === 'fridge' && G.lit) ? 'grin' : 'sneak')
}
function famAnim(t) {
  for (const f of (G ? G.fam : [])) {
    const P = famMesh[f.id], H = holders[f.id]
    if ((G.phase === 'result' ? G.scene : G.phase) === 'caught') { if (!P.dog) { P.headG.rotation.y = Math.sin(W.time * 3 + f.r) * 0.1 } else { P.headG.rotation.x = -0.25 + Math.sin(W.time * 18) * 0.1; P.tail.rotation.z = Math.sin(W.time * 20) * 0.6 } continue }
    const L = f.L ?? loudness(f, G.t)
    if (f.state === 'sleep') {
      if (f.walk) continue
      P.setFace(f.hmmT > 0 ? 'hmm' : L > 0.5 ? 'snore' : 'sleep')
      P.bubble.visible = true; P.bubble.scale.setScalar(0.6 + L * (1.6 + Math.sin(W.time * 3.2) * 0.6))
      const breathe = 1 + L * 0.06 * Math.sin(W.time * 5)
      if (P.dog) { P.upper.position.y = 0.2; P.headG.rotation.x = 0.35; P.root.scale.set(P.scale, P.scale * breathe, P.scale); P.tail.rotation.z = 0 }
      else {
        P.upper.scale.set(1, 1, breathe)
        const roll = f.turnAnim > 0 ? Math.sin((1.2 - f.turnAnim) / 1.2 * PI) * 1.2 : 0
        if (SPOTS[f.id].pose === 'chair') { P.upper.rotation.set(-0.4 + roll * 0.4, roll * 0.5, 0); P.headG.rotation.set(-0.5, 0, roll * 0.3) }
        else { P.root.rotation.y = roll; P.upper.rotation.x = 0 }
      }
      const zi = Math.floor(W.time * 2.2 + f.r); if (L > 0.5 && zi !== f.zi) { const hp = P.headG.getWorldPosition(new THREE.Vector3()); spawnZ(hp.x, hp.y + 0.4, hp.z, f.id === 'dad') } f.zi = zi
    } else if (f.state === 'look') {
      P.setFace('awake'); P.bubble.visible = false
      const k = Math.sin(W.time * 2.4)
      if (P.dog) { P.upper.position.y = 0.42; P.headG.rotation.set(-0.3, k * 0.6, 0) }
      else if (SPOTS[f.id].pose === 'chair') { P.upper.rotation.set(0.05, 0, 0); P.headG.rotation.set(0, k * 0.8, 0) }
      else { P.root.rotation.y = 0; P.upper.rotation.x = PI / 2 * 0.9; P.headG.rotation.set(0, k * 0.8, 0) }
    } else if (f.state === 'walk') {
      if (!f.posed) { f.posed = true; poseStand(P, f.walk.x, f.walk.z, 0); P.setFace('sleep') }
      const wk = f.walk, mv = wk.wait <= 0 && G.hugT <= 0
      H.position.set(wk.x, 0, wk.z); H.rotation.y = wk.v > 0 ? 0 : PI
      const ww = W.time * 5
      P.legL.rotation.x = mv ? Math.sin(ww) * 0.4 : 0; P.legR.rotation.x = mv ? -Math.sin(ww) * 0.4 : 0
      P.armL.rotation.set(-1.5, 0, 0.1); P.armR.rotation.set(-1.5, 0, -0.1); P.upper.rotation.set(0, 0, Math.sin(ww * 0.5) * 0.08); P.headG.rotation.set(0.2, 0, Math.sin(ww * 0.5) * 0.2)
      P.bubble.visible = true; P.bubble.scale.setScalar(1.2 + Math.sin(W.time * 3) * 0.6); P.setFace(G.hugT > 0 ? 'snore' : 'sleep')
      if (G.hugT > 0) { P.armL.rotation.set(-1.3, 0, 0.6); P.armR.rotation.set(-1.3, 0, -0.6) }
    }
  }
}
function propAnim() {
  if (!G || G.phase === 'title') { doorPivot.rotation.y = 0; return }
  doorPivot.rotation.y = -G.door * 1.9
  const lit = G.door > 0.25 ? (G.door - 0.25) / 0.75 : 0
  fridgeLight.intensity = lit * 14; beam.material.opacity = lit * 0.85
  fIn.material.color.set(lit > 0 ? '#fff6dc' : '#7d8698')
  for (const h of HAZ) if (h.mesh && h.kick > 0) { h.kick = Math.max(0, h.kick - STEP * 0.8); h.mesh.position.z += 0.06 * h.kick; h.mesh.position.x += 0.02 * h.kick; h.mesh.rotation.z += 0.3 * h.kick }
  tvLight.intensity = 4 + Math.sin(W.time * 13) * 1.2 + Math.sin(W.time * 31) * 0.8
  tvScreen.material.color.setHSL(0.6 + Math.sin(W.time * 3) * 0.04, 0.8, 0.55 + Math.sin(W.time * 17) * 0.06)
}
// カメラ（斜め上から。縦持ちは引く）
// 横持ちは正面の斜め上（道が左から右）、縦持ちは左後ろの斜め上（道が下から上）
const CAM_L = new THREE.Vector3(0.1, 0.84, 0.54).normalize(), CAM_P = new THREE.Vector3(-0.62, 0.86, 0.42).normalize()
const portrait = () => innerWidth / innerHeight < 0.9
const camDir = () => portrait() ? CAM_P : CAM_L
function camFrame(tx, tz, mul = 1, snap) {
  const a = innerWidth / innerHeight, tv = Math.tan(20 * PI / 180)
  const d = (portrait() ? Math.max(3.1 / (tv * a), 3.6 / tv) : Math.max(6.2 / (tv * a), 3.4 / tv)) * mul
  const look = new THREE.Vector3(tx, 0.4, tz), pos = look.clone().addScaledVector(camDir(), d)
  if (snap) { W.camPos.copy(pos); W.camLook.copy(look) } else { W.camPos.lerp(pos, 0.08); W.camLook.lerp(look, 0.1) }
  camera.position.copy(W.camPos); camera.lookAt(W.camLook)
}
function camUpdate(snap) {
  if (!G || G.phase === 'title') { const x = Math.sin(W.time * 0.12) * 10.5; camFrame(x, 0, 1.15, snap); return }
  const pp = playerPos()
  if (W.camAt) return camFrame(W.camAt[0], W.camAt[1], W.camAt[2], snap)
  const ph = G.phase === 'result' ? G.scene : G.phase
  if (ph === 'eat') return camFrame(-13.0, -1.2, 0.5, snap)
  if (ph === 'caught') { const [cx, cz] = W.caughtCenter, cd = camDir(); return camFrame(cx - cd.x * 0.8, cz - cd.z * 0.8, portrait() ? 0.5 : 0.68, snap) }
  const mul = G.sub !== 'walk' ? 0.78 : G.hugT > 0 ? 0.7 : 1
  const ah = portrait() ? 2.6 : 1.8
  const ax = G.sub !== 'walk' ? -0.6 : pp.dx * G.dir * ah, az = G.sub !== 'walk' ? 0.2 : pp.dz * G.dir * 0.8
  const tz = pp.z + az
  camFrame(pp.x + ax, G.sub === 'walk' ? lerp(tz, -1.1, portrait() ? 0.45 : 0.6) : tz, mul, snap)
}
function render() {
  const t = W.time
  heroAnim(t); famAnim(t); propAnim(); camUpdate()
  renderer.render(scene, camera)
  if (!$('#vPlay').hidden) drawHUD()
}

// ---------- HUD
const tagEls = {}
function project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, ok: v.z < 1 } }
function buildTags() {
  const box = $('#tags'); box.innerHTML = ''
  for (const f of [...D.FAMILY, { id: 'me' }]) { const el = document.createElement('div'); el.className = 'tagx'; el.innerHTML = `<div class="bub"></div><div class="gauge"><i></i></div>`; box.appendChild(el); tagEls[f.id] = { el, bub: el.firstChild, g: el.lastChild.firstChild, last: '' } }
}
function fx(x, y, z, text, cls) {
  if (G?.sim) return
  const p = project(x, y, z), el = document.createElement('div'); el.className = 'fx ' + (cls || ''); el.textContent = text
  $('#tags').appendChild(el); setTimeout(() => el.remove(), 1000)
  // 長い文字が画面からはみ出さないように寄せる（拡大の 1.15 倍ぶんも見込む）
  const hw = el.offsetWidth * 0.6 + 6
  el.style.left = (hw * 2 > innerWidth ? innerWidth / 2 : clamp(p.x, hw, innerWidth - hw)) + 'px'; el.style.top = clamp(p.y, 90, innerHeight - 60) + 'px'
}
function flash() { const f = $('#flash'); f.style.transition = 'none'; f.style.opacity = 0.85; requestAnimationFrame(() => { f.style.transition = 'opacity .6s'; f.style.opacity = 0 }) }
const stripCv = {}
function drawHUD() {
  if (!G || G.phase === 'title') return
  const pp = playerPos(), play = G.phase === 'play'
  // 捕まった場面のセリフ
  if (G.phase === 'caught') {
    const list = [...G.says, { id: 'me', k: 'caughtMe', at: 0.45 }]
    let i = 0
    for (const [id, tg] of Object.entries(tagEls)) {
      const sy = list.find(x => x.id === id), on = sy && G.sceneT >= sy.at
      tg.el.style.display = on ? '' : 'none'; if (!on) continue
      const P = id === 'me' ? hero : famMesh[id], hp = P.headG.getWorldPosition(new THREE.Vector3())
      const p = project(hp.x, hp.y + (id === 'me' ? 0.9 : 0.7), hp.z)
      const txt = T(sy.k), cls = id === 'me' ? 'wake' : sy === list[0] ? 'hmm' : ''
      if (tg.last !== txt + cls) { tg.last = txt + cls; tg.bub.textContent = txt; tg.bub.className = 'bub ' + cls }
      tg.g.parentNode.style.display = 'none'
      const tw = (tg.el.offsetWidth || 80) / 2 + 4; tg.el.style.left = clamp(p.x, tw, innerWidth - tw) + 'px'; tg.el.style.top = clamp(p.y, 110, innerHeight - 20) + 'px'
      i++
    }
    const sig = $('#sig'), st = G.by === 'dawn' ? T('dawnMsg') : ''; if (sig.textContent !== st) { sig.textContent = st; sig.className = 'stop' }
    $('#hold').hidden = true
    const sb = $('#stripBox'); if (sb.dataset.k !== '') { sb.innerHTML = ''; sb.dataset.k = '' }
    return
  }
  tagEls.me.el.style.display = 'none'
  // 寝ている人の吹き出しとゲージ
  for (const f of G.fam) {
    const tg = tagEls[f.id], P = famMesh[f.id]
    const hp = P.headG.getWorldPosition(new THREE.Vector3()), p = project(hp.x, hp.y + 0.75, hp.z)
    const show = play && p.ok && p.x > -40 && p.x < innerWidth + 40 && (f.d ?? 99) < f.r + 4
    tg.el.style.display = show ? '' : 'none'; if (!show) continue
    const tw = (tg.el.offsetWidth || 80) / 2 + 4; tg.el.style.left = clamp(p.x, tw, innerWidth - tw) + 'px'; tg.el.style.top = clamp(p.y, 100, innerHeight - 20) + 'px'
    let txt, cls
    const nm = S.lang === 'ja' ? f.ja : f.en
    if (f.state === 'look') { txt = T('wake'); cls = 'wake' } else if (f.state === 'walk') { txt = T('hug').split('…')[0] + '…'; cls = 'quiet' } else if (f.hmmT > 0) { txt = T('hmm'); cls = 'hmm' } else if (f.apT > 0) { txt = nm + ' ' + T('apnea'); cls = 'quiet' } else if ((f.L ?? 0) > 0.5) { txt = nm + ' ' + (S.lang === 'ja' ? f.snoreJa : f.snoreEn); cls = 'loud' } else { txt = nm + ' …'; cls = 'quiet' }
    if (tg.last !== txt + cls) { tg.last = txt + cls; tg.bub.textContent = txt; tg.bub.className = 'bub ' + cls }
    tg.g.parentNode.style.display = f.state === 'walk' ? 'none' : ''
    tg.g.style.width = Math.min(100, f.g) + '%'; tg.g.style.background = f.g < 50 ? 'var(--go)' : f.g < 80 ? 'var(--pud)' : 'var(--ng)'
  }
  // いびきの波（近い2人）
  const near = !play ? [] : G.fam.filter(f => f.state === 'sleep' && !f.walk && (f.d ?? 99) < f.r + 1.2).sort((a, b) => a.d - b.d).slice(0, 2)
  const key = near.map(f => f.id).join(',')
  const sb = $('#stripBox')
  if (sb.dataset.k !== key || sb.dataset.l !== S.lang) {
    sb.dataset.k = key; sb.dataset.l = S.lang; sb.innerHTML = ''
    for (const f of near) { const d = document.createElement('div'); d.className = 'strip'; d.innerHTML = `<div class="who" style="background:${f.col}">${S.lang === 'ja' ? f.ja : f.en[0]}</div><canvas></canvas>`; sb.appendChild(d); stripCv[f.id] = d.querySelector('canvas') }
  }
  for (const f of near) {
    const c = stripCv[f.id]; if (!c) continue
    const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(2, devicePixelRatio || 1)
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h)
    const span = 4.5, past = 0.6, px = past / span * w
    x.fillStyle = 'rgba(255,74,90,.28)'; x.fillRect(0, 0, w, h)
    for (const [a, b, vb] of f.segs) { const e = b < G.t ? b : vb, s0 = (a + 0.15 - G.t + past) / span * w, s1 = (e - 0.15 - G.t + past) / span * w; if (s1 < 0 || s0 > w) continue; x.fillStyle = '#5be38a'; x.fillRect(s0, 3, s1 - s0, h - 6) }
    // 波線の飾り
    x.strokeStyle = 'rgba(22,18,42,.55)'; x.lineWidth = 1.5; x.beginPath()
    for (let i = 0; i <= w; i += 2) { const tt = G.t - past + i / w * span, a = loudness(f, tt); x.lineTo(i, h / 2 + Math.sin(tt * 18) * a * (h / 2 - 3)) } x.stroke()
    x.fillStyle = '#fff'; x.fillRect(px - 1.5, 0, 3, h)
  }
  // 合図
  const sig = $('#sig'); let st = '', sc = ''
  const look = G.fam.some(f => f.state === 'look' && f.d < f.r * 1.5)
  if (!play) st = ''
  else if (look) { st = T('sigFreeze'); sc = 'frz' }
  else if (G.hugT > 0) { st = T('hugMe'); sc = 'stop' }
  else if (G.sub === 'fridge') { st = G.door < 1 ? T('sigFridge') : G.items >= MAXI ? T('sigFull') : T('sigGrab'); sc = 'info' }
  else if (near.length) { const ok = near.every(f => isLoud(f, G.t)); st = ok ? T('sigGo') : T('sigStop'); sc = ok ? 'go' : 'stop' }
  if (sig.textContent !== st) sig.textContent = st; if (sig.className !== sc) sig.className = sc
  // 時計
  const m = Math.min(D.DAWN, G.t) | 0, hh = 3 + Math.floor(m / 60), mm = m % 60
  $('#clockT').textContent = `${hh}:${String(mm).padStart(2, '0')}`; $('#clock').classList.toggle('late', G.t > D.DAWN - 20)
  $('#itemN').textContent = G.items
  $('#hold').classList.toggle('on', G.held && play); $('#hold').hidden = !play
}

// ---------- 画面
function go(v) { for (const id of ['vTitle', 'vHow', 'vPlay', 'vResult']) $('#' + id).hidden = id !== v }
function applyLang() {
  document.documentElement.lang = S.lang
  for (const el of $$('[data-t]')) { const k = el.dataset.t; el.innerHTML = k === 'how1' ? T(S.pc ? 'how1pc' : 'how1sp') : T(k) }
  $('#bLang').textContent = T('lang')
  $('#holdT').textContent = T(S.pc ? 'holdPc' : 'holdSp')
  $('#tut1').innerHTML = T(S.pc ? 'tutPc' : 'tutSp'); $('#tutGo').textContent = T(S.pc ? 'tutGoPc' : 'tutGo')
  for (const u of $$('.icInput')) u.setAttribute('href', S.pc ? '#i-key' : '#i-hand')
  $('#bHow').textContent = T('how')
  if (G?.result) fillResult()
}
function toTitle() { G = null; resetWorld(); go('vTitle'); Snd.setTrack('title'); for (const id of Object.keys(famMesh)) famMesh[id].setFace('sleep') ; titleFam() }
let titleG = null
function titleFam() { titleG = { t: 0 }; newGame(7); G.phase = 'title' }
function startGame(seed) {
  newGame(seed ?? ((Date.now() ^ (Math.random() * 1e9)) >>> 0)); resetWorld()
  G.phase = 'play'; go('vPlay'); $('#skipHint').hidden = true; buildTags(); $('#stripBox').dataset.k = '-'
  camUpdate(true); Snd.setTrack('sneak')
  if (!S.tut) { $('#tut').hidden = false; W.tutWait = true } else W.tutWait = false
}
// 結果
function calcResult() {
  const R = { ok: G.outcome === 'ok', items: G.items, wakes: G.wakes, turns: G.turns, time: G.outcome === 'ok' ? Math.round(G.time * 10) / 10 : null, by: G.by }
  if (R.ok) {
    let dan = 1 + (R.items - 1) + (R.wakes === 0 ? 2 : R.wakes === 1 ? 1 : 0) + (R.turns === 0 ? 1 : 0) + (R.time <= 40 ? 2 : R.time <= 55 ? 1 : 0)
    R.kaiden = dan >= 11; R.rank = Math.min(10, dan)
  } else {
    const prog = G.dir > 0 ? 0.5 * G.s / LEN : 0.5 + 0.5 * (1 - G.s / LEN)
    R.rank = clamp(10 - Math.floor(prog * 10), 1, 10); R.prog = prog
  }
  const rr = rng(G.seed ^ 0x9e37)
  const order = ['mom', 'dad', 'sister', 'dog'].sort((a, b) => (b === G.by) - (a === G.by))
  R.talk = order.map(id => ({ id, i: Math.floor(rr() * 3) }))
  return R
}
const KYU = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
function titleText(R) {
  if (S.lang === 'ja') return R.ok ? (R.kaiden ? `${T('ninja')} ${T('kaiden')}` : `${T('ninja')} ${D.NUM_JA[R.rank - 1]}${T('dan')}`) : `${T('minarai')} ${KYU[R.rank - 1]}${T('kyu')}`
  return R.ok ? (R.kaiden ? `${T('ninja')}: ${T('kaiden')}` : `${T('ninja')} ${R.rank}-${T('dan')}`) : `${T('minarai')} ${R.rank}-${T('kyu')}`
}
function subText(R) { return R.ok ? D.SUB_OK[S.lang][R.items - 1] : D.SUB_NG[R.by][S.lang] }
function talkOf(R, x) { const F = D.FAMILY.find(f => f.id === x.id); return { name: S.lang === 'ja' ? F.ja : F.en, col: F.col, text: D.TALK[R.ok ? 'ok' : 'ng'][x.id][S.lang][x.i] } }
function fillResult() {
  const R = G.result
  $('#rStamp').textContent = R.ok ? T('resOk') : T('resNg'); $('#rStamp').className = 'stamp ' + (R.ok ? 'ok' : 'ng') + (W.revealed ? ' on' : '')
  $('#rTitle').textContent = titleText(R); $('#rSub').textContent = subText(R)
  $('#rItems').textContent = R.items + T('ko'); $('#rWakes').textContent = R.wakes + T('kai'); $('#rTime').textContent = R.ok ? R.time + T('sec') : '-'
  $('#rCmts').innerHTML = `<h3>${R.ok ? T('talkOk') : T('talkNg')}</h3>` + R.talk.map(x => { const t = talkOf(R, x); return `<div class="cm"><span class="who" style="background:${t.col}">${t.name[0]}</span><span>${t.text}</span></div>` }).join('')
}
function showResult() {
  if (G.phase === 'result') return
  G.result = calcResult(); G.phase = 'result'; W.revealed = false
  $('#skipHint').hidden = true; go('vResult'); fillResult()
  for (const id of ['#rTitle', '#rSub']) $(id).classList.remove('on')
  for (const id of ['#rItems', '#rWakes', '#rTime']) $(id).style.visibility = 'hidden'
  $('.cmts').style.visibility = 'hidden'
  const seq = [[250, () => { $('#rItems').style.visibility = ''; Snd.sfx('tap') }], [550, () => { $('#rWakes').style.visibility = ''; Snd.sfx('tap') }], [850, () => { $('#rTime').style.visibility = ''; Snd.sfx('tap'); Snd.sfx('drum') }], [2100, revealNow]]
  W.revealTimers = seq.map(([ms, fn]) => setTimeout(fn, ms))
}
function revealNow() {
  if (W.revealed) return; W.revealed = true; (W.revealTimers || []).forEach(clearTimeout)
  for (const id of ['#rItems', '#rWakes', '#rTime']) $(id).style.visibility = ''
  $('.cmts').style.visibility = ''; $('#rTitle').classList.add('on'); $('#rSub').classList.add('on'); $('#rStamp').classList.add('on')
  Snd.sfx('stamp'); Snd.sfx(G.result.ok ? 'fanfare' : 'boo')
}
// 結果を1枚の画像に（1080x1350）
async function makeCard() {
  const R = G.result, c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d')
  try { await document.fonts.ready } catch (e) {}
  const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#1d2550'); g.addColorStop(1, '#0b1024'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350)
  // 3Dの場面
  renderer.render(scene, camera)
  const src = renderer.domElement, sw = src.width, sh = src.height, ta = 1000 / 640
  let cw = sw, ch = sw / ta; if (ch > sh) { ch = sh; cw = sh * ta }
  x.save(); roundRect(x, 40, 150, 1000, 640, 28); x.clip(); x.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 40, 150, 1000, 640); x.restore()
  x.lineWidth = 8; x.strokeStyle = '#16122a'; roundRect(x, 40, 150, 1000, 640, 28); x.stroke()
  const disp = "'Dela Gothic One','Hiragino Sans',sans-serif", maru = "'Zen Maru Gothic','Hiragino Maru Gothic ProN',sans-serif"
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'
  x.font = `68px ${disp}`; x.lineWidth = 12; x.strokeStyle = '#16122a'; x.strokeText(T('full'), 540, 112); x.fillStyle = '#ffd23f'; x.fillText(T('full'), 540, 112)
  // ハンコ
  x.save(); x.translate(860, 250); x.rotate(-0.18); const col = R.ok ? '#e8243f' : '#3a55e0'
  x.fillStyle = 'rgba(255,248,236,.92)'; roundRect(x, -150, -78, 300, 140, 22); x.fill(); x.strokeStyle = col; x.lineWidth = 12; roundRect(x, -150, -78, 300, 140, 22); x.stroke()
  x.fillStyle = col; x.font = `${S.lang === 'ja' ? 88 : 54}px ${disp}`; x.fillText(R.ok ? T('resOk') : T('resNg'), 0, 22); x.restore()
  // 称号
  x.fillStyle = '#fff8ec'; fitText(x, titleText(R), 540, 880, 980, 70, disp)
  x.fillStyle = '#ff8fb1'; fitText(x, subText(R), 540, 940, 980, 38, maru, 900)
  // 数字
  const st = [[T('rItems'), R.items + T('ko')], [T('rWakes'), R.wakes + T('kai')], [T('rTime'), R.ok ? R.time + T('sec') : '-']]
  st.forEach(([k, v], i) => { const bx = 60 + i * 330; x.fillStyle = '#fff8ec'; roundRect(x, bx, 975, 300, 120, 20); x.fill(); x.fillStyle = '#5b5480'; x.font = `900 26px ${maru}`; x.fillText(k, bx + 150, 1015); x.fillStyle = '#16122a'; x.font = `54px ${disp}`; x.fillText(v, bx + 150, 1075) })
  // 寝言
  x.textAlign = 'left'
  R.talk.slice(0, 2).forEach((tk, i) => { const t = talkOf(R, tk), y = 1135 + i * 70; x.fillStyle = t.col; x.beginPath(); x.arc(90, y + 22, 24, 0, 7); x.fill(); x.fillStyle = '#16122a'; x.font = `900 26px ${maru}`; x.textAlign = 'center'; x.fillText(t.name[0], 90, y + 32); x.textAlign = 'left'; x.fillStyle = '#dbe8ff'; fitText(x, `「${t.text}」`, 130, y + 34, 900, 32, maru, 900, 'left') })
  x.textAlign = 'center'; x.fillStyle = 'rgba(219,232,255,.7)'; x.font = `900 24px ${maru}`; x.fillText('tom3games.github.io/midnight-pudding', 540, 1318)
  return new Promise(r => c.toBlob(r, 'image/png'))
}
function fitText(x, s, cx, cy, maxW, size, fam, weight = '', align = 'center') { let sz = size; do { x.font = `${weight} ${sz}px ${fam}`; sz -= 2 } while (x.measureText(s).width > maxW && sz > 14); x.textAlign = align; x.fillText(s, cx, cy) }
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath() }
const PUBLIC_URL = 'https://tom3games.github.io/midnight-pudding/'
function xPost() {
  const R = G.result, ja = S.lang === 'ja'
  const text = ja ? `${titleText(R)}「${subText(R)}」取れたもの${R.items}個 #深夜のプリン作戦` : `${titleText(R)} "${subText(R)}" Snacks: ${R.items} #MidnightPudding`
  return { text, url: PUBLIC_URL, href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(PUBLIC_URL)}` }
}
function openX() { if (!G || !G.result) return; window.open(xPost().href, '_blank', 'noopener') }
async function saveImage() {
  const blob = await makeCard(); if (!blob) return null
  const file = new File([blob], 'midnight-pudding.png', { type: 'image/png' })
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: T('full'), text: `${titleText(G.result)} #${S.lang === 'ja' ? '深夜のプリン作戦' : 'MidnightPudding'} https://tom3games.github.io/midnight-pudding/` }); return blob } } catch (e) { if (e && e.name === 'AbortError') return blob }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'midnight-pudding.png'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(T('saved')); return blob
}
function toast(s) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 1600) }

// ---------- 入力（押している間だけ進む）
function press(v) {
  if (!G || G.phase !== 'play') return
  if (W.tutWait) return
  G.held = v
}
function bindInput() {
  const hit = $('#hit')
  hit.addEventListener('pointerdown', e => { e.preventDefault(); Snd.init(); if (G && (G.phase === 'caught' || G.phase === 'eat')) { if (G.sceneT > 1.0) showResult(); return } press(true) })
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) hit.addEventListener(ev, () => press(false))
  window.addEventListener('pointerup', () => press(false))
  $('#tut').addEventListener('pointerdown', e => { e.preventDefault(); Snd.init(); Snd.sfx('tap'); $('#tut').hidden = true; W.tutWait = false; S.tut = true; try { localStorage.setItem('mp.tut', '1') } catch (er) {} })
  const keys = [' ', 'Spacebar', 'ArrowUp', 'ArrowRight', 'w', 'W', 'Enter']
  window.addEventListener('keydown', e => {
    if (!keys.includes(e.key)) return
    if (!$('#vPlay').hidden) { e.preventDefault(); Snd.init(); if (!$('#tut').hidden) { $('#tut').dispatchEvent(new Event('pointerdown')); return } if (G && (G.phase === 'caught' || G.phase === 'eat')) { if (G.sceneT > 1.0 && !e.repeat) showResult(); return } press(true) }
  })
  window.addEventListener('keyup', e => { if (keys.includes(e.key)) press(false) })
  window.addEventListener('blur', () => press(false))
  document.addEventListener('visibilitychange', () => { press(false); lastT = performance.now(); acc = 0 })
  hit.addEventListener('contextmenu', e => e.preventDefault())
}

// ---------- ループ（固定60Hz。時計は performance.now()）
let acc = 0, lastT = performance.now()
function loop() {
  const now = performance.now(); let dt = (now - lastT) / 1000; lastT = now; if (dt > 0.25) dt = 0.25
  if (!W.paused) { acc += dt; let n = 0; while (acc >= STEP && n < 10) { if (!W.tutWait || G?.phase !== 'play') update(STEP); acc -= STEP; n++ } if (n >= 10) acc = 0 }
  W.frames = (W.frames || 0) + 1
  render(); Snd.tick()
  requestAnimationFrame(loop)
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() }

// ---------- 起動
function boot() {
  try { const l = localStorage.getItem('mp.lang'); S.lang = l || ((navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en') } catch (e) { S.lang = (navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en' }
  try { S.tut = localStorage.getItem('mp.tut') === '1'; if (localStorage.getItem('mp.mute') === '1') Snd.muted = true } catch (e) {}
  const syncMute = () => { for (const b of $$('.mute')) { b.querySelector('.icOn').hidden = Snd.muted; b.querySelector('.icOff').hidden = !Snd.muted } }
  syncMute(); applyLang(); bindInput(); resize()
  const on = (sel, fn) => { for (const el of $$(sel)) el.addEventListener('click', e => { Snd.init(); fn(e) }) }
  on('#bStart', () => { Snd.sfx('tap'); startGame() })
  on('#bHow', () => { Snd.sfx('tap'); go('vHow') })
  on('#bHowBack', () => { Snd.sfx('tap'); go('vTitle') })
  on('#bHowGo', () => { Snd.sfx('tap'); S.tut = true; startGame() })
  on('#bAgain', () => { Snd.sfx('tap'); startGame() })
  on('#bSave', () => saveImage())
  on('#bX', () => { Snd.sfx('tap'); openX() })
  on('#bTitle', () => { Snd.sfx('tap'); toTitle() })
  on('#bHome', () => { Snd.sfx('tap'); toTitle() })
  on('#bLang', () => { S.lang = S.lang === 'ja' ? 'en' : 'ja'; try { localStorage.setItem('mp.lang', S.lang) } catch (e) {} applyLang() })
  on('.mute', () => { Snd.setMute(!Snd.muted); syncMute(); try { localStorage.setItem('mp.mute', Snd.muted ? '1' : '0') } catch (e) {} })
  window.addEventListener('resize', resize)
  // タイトルで最初のタップに音を鳴らし始める
  document.addEventListener('pointerdown', () => { Snd.init(); if (!$('#vTitle').hidden) Snd.setTrack('title') }, { once: true })
  toTitle(); Snd.want = 'title'
  $('#loading').remove()
  requestAnimationFrame(loop)
  window.__mpReady = true
}

// 検証用の窓口
function sim(seed, policy = 'bot', opt = {}) {
  const keep = G; newGame(seed); G.sim = true; resetWorld(); G.phase = 'play'
  const want = opt.items ?? 1
  let n = 0
  while (G.phase === 'play' && n < 60 * 150) {
    G.held = policy === 'always' ? true : policy === 'never' ? false : botWants(want)
    update(STEP); n++
  }
  const out = { phase: G.phase, outcome: G.outcome, by: G.by, t: +G.t.toFixed(2), items: G.items, wakes: G.wakes, turns: G.turns }
  if (G.outcome) { G.result = calcResult(); out.title = titleText(G.result); out.rank = G.result.rank }
  G = keep; resetWorld()
  return out
}
// お手本の動き: 近い家族が全員いびきの大きい間だけ押す
function botWants(want) {
  const pp = playerPos()
  if (G.fam.some(f => f.state === 'look')) return false
  if (G.sub === 'fridge') { if (G.door >= 1 && G.items >= want) return false; return G.fam.filter(f => f.id === 'mom' || f.id === 'dog').every(f => f.g < 80 && (isLoud(f, G.t) || f.g < TUNE.botRisk + 15)) }
  const dad = G.fam.find(f => f.id === 'dad')
  if (dad.walk) { const nx = posAt(G.s + G.dir * 0.9); if (Math.hypot(nx.x - dad.walk.x, nx.z - dad.walk.z) < 1.3) return false }
  for (const f of G.fam) { if (f.state !== 'sleep') continue; const q = famPos(f), d = Math.hypot(q.x - pp.x, q.z - pp.z); if (d < f.r + 0.3 && !(isLoud(f, G.t) && visibleLoud(f, G.t + 0.25, G.t)) && f.g > TUNE.botRisk) return false; if (f.g > 60 && d < f.r + 0.5) return false }
  return true
}
window.mp = {
  get G() { return G }, S, TUNE, D, W, LEN, HAZ, posAt, loudness, isLoud, startGame, toTitle, showResult, revealNow, calcResult, saveImage, xPost, openX, makeCard, sim, Snd, applyLang, go, titleText,
  setHold: v => press(v), skipTut: () => { $('#tut').hidden = true; W.tutWait = false; S.tut = true },
  fps: () => W.frames,
  dbg: {
    pause: v => { W.paused = v }, step: n => { for (let i = 0; i < n; i++) update(STEP) }, render: () => render(),
    // 台本: 位置と状態を直接置く
    set: o => { Object.assign(G, o) }, fam: id => G.fam.find(f => f.id === id), caught, success,
    snapCam: () => camUpdate(true),
  },
}
boot()
