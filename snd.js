// 音のエンジン（素材なし・WebAudio）。bakage/templates/snd.js が土台。曲と効果音はこのゲーム用
// 最初のタップで Snd.init()、画面切替で Snd.setTrack('名前')、ループで毎フレーム Snd.tick()
'use strict'
const Snd = {
  ctx: null, muted: false, next: 0, step: 0, track: null, want: null, switchAt: 0, played: {}, lastStep: 0,
  TEMPO: { title: 84, sneak: 100, win: 132, lose: 76 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      this.ctx = new AC()
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(this.ctx.destination)
      this.bgm = this.ctx.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
    return o
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02)
  },
  // 声っぽい音（ノコギリ波を声の帯域で絞る）。f0 から f1 へ、ビブラート付き
  voice(t0, dur, f0, f1, vol = 0.12, vib = 7, formant = 1100) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur)
    lfo.frequency.value = vib; lg.gain.value = f0 * 0.04; lfo.connect(lg); lg.connect(o.frequency)
    f.type = 'bandpass'; f.frequency.value = formant; f.Q.value = 1.4
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04); g.gain.setValueAtTime(vol, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05)
  },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(0.26, c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  pluck(n, t, vol = 0.12, dur = 0.16) { this.tone(this.mtof(n), t, dur, 'triangle', vol, this.bgm); this.tone(this.mtof(n) * 2, t, dur * 0.4, 'sine', vol * 0.25, this.bgm) },
  bell(n, t, vol = 0.05, dur = 0.9) { this.tone(this.mtof(n), t, dur, 'sine', vol, this.bgm); this.tone(this.mtof(n) * 3.01, t, dur * 0.35, 'sine', vol * 0.3, this.bgm) },
  kick(t, v = 0.5) { this.tone(130, t, 0.14, 'sine', v, this.bgm, 45) },
  hat(t, v = 0.03) { this.noise(t, 0.025, v, 8000, 'highpass', this.bgm) },
  // タイトル: オルゴールの子守歌（Fmaj7 - Em7 - Dm7 - C）
  p_title(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const ch = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 60]][bar]
    if (s % 4 === 0) this.pluck(ch[0] - 12, t, 0.1, 0.6)
    if (s % 2 === 0) this.bell(ch[(s / 2) % 4] + 12, t, 0.025, 0.5)
    const mel = [[77, -1, 76, 72], [76, -1, 74, 71], [74, -1, 72, 69], [72, -1, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.bell(n + 12, t, 0.04, 1.0) }
  },
  // こっそり: ピチカートの抜き足（Am の下降ベース）
  p_sneak(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const bass = [[45, -1, 52, -1, 45, -1, 52, -1], [44, -1, 52, -1, 44, -1, 52, -1], [43, -1, 50, -1, 43, -1, 50, -1], [41, -1, 48, -1, 40, -1, 47, -1]][bar]
    if (s % 2 === 0) { const n = bass[s / 2]; if (n > 0) this.pluck(n, t, 0.16, 0.12) }
    if (s === 4 || s === 12) this.hat(t, 0.02)
    const mel = [[69, 72, -1, 71, -1, -1, 69, -1], [68, 71, -1, 69, -1, -1, 68, -1], [67, 71, -1, 74, -1, 72, 71, -1], [69, -1, -1, 64, -1, -1, -1, -1]][bar]
    if (Math.floor(i / 64) % 2 === 1 && s % 2 === 0) { const n = mel[s / 2]; if (n > 0) this.pluck(n + 12, t, 0.06, 0.1) }
  },
  // 成功: うれしいスキップ（C - F - G - C）
  p_win(i, t) {
    const bar = Math.floor(i / 16) % 4, s = i % 16
    const root = [48, 53, 55, 48][bar], ch = [[64, 67, 72], [65, 69, 72], [67, 71, 74], [64, 67, 72]][bar]
    if (s % 4 === 0) this.kick(t, 0.35); if (s % 4 === 2) this.hat(t, 0.04)
    if (s % 4 === 0 || s % 4 === 3) this.pluck(root - 12 + (s % 8 === 3 ? 7 : 0), t, 0.14, 0.15)
    if (s % 4 === 2) for (const n of ch) this.pluck(n, t, 0.03, 0.12)
    const mel = [[72, 74, 76, 79], [77, 76, 74, 72], [74, 76, 77, 79], [84, -1, 79, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.bell(n, t, 0.05, 0.35) }
  },
  // 発覚: しょんぼりワルツ
  p_lose(i, t) {
    const bar = Math.floor(i / 12) % 4, s = i % 12
    const ch = [[57, 60, 64], [57, 62, 65], [56, 59, 64], [57, 60, 64]][bar], root = [45, 50, 52, 45][bar]
    if (s === 0) this.pluck(root - 12, t, 0.14, 0.7); if (s === 4 || s === 8) for (const n of ch) this.pluck(n, t, 0.025, 0.3)
    const mel = [[76, 74, 72], [74, 72, 69], [71, 69, 68], [69, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.tone(this.mtof(n), t, 0.5, 'sine', 0.05, this.bgm) }
  },
  // いびき（vol は距離で弱める、kind は家族ごとの声）
  snore(kind, vol, dur) {
    if (!this.ctx || vol < 0.02) return; const t = this.ctx.currentTime; this.mark('snore')
    const base = { sister: 160, dad: 62, dog: 210, mom: 95 }[kind] || 80
    const n = Math.max(1, Math.round(dur / 1.1))
    for (let k = 0; k < n; k++) {
      const s = t + k * (dur / n), len = Math.min(0.9, dur / n * 0.75)
      if (kind === 'dog') { this.noise(s, len * 0.6, 0.12 * vol, 1400, 'bandpass', null, 2); this.tone(base, s, len * 0.5, 'sine', 0.06 * vol, null, base * 0.8); continue }
      // ガーッ: 低いノコギリを振るわせる＋息のノイズ
      const c = this.ctx, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), g = c.createGain()
      o.type = 'sawtooth'; o.frequency.value = base; lfo.frequency.value = kind === 'sister' ? 18 : 28; lg.gain.value = 0.9
      const am = c.createGain(); am.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain)
      f.type = 'lowpass'; f.frequency.value = kind === 'dad' ? 700 : 1100
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.16 * vol, s + len * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, s + len)
      o.connect(am); am.connect(f); f.connect(g); g.connect(this.master); o.start(s); lfo.start(s); o.stop(s + len + 0.05); lfo.stop(s + len + 0.05)
      this.noise(s, len, 0.05 * vol, 600, 'bandpass', null, 0.8)
    }
  },
  sfx(name, v = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.mark(name)
    switch (name) {
      case 'tap': this.tone(880, t, 0.06, 'triangle', 0.12 * v); break
      case 'step': if (t - this.lastStep < 0.2) return; this.lastStep = t; this.noise(t, 0.04, 0.04 * v, 900, 'bandpass', null, 3); break
      case 'creak': this.tone(180, t, 0.35, 'sawtooth', 0.12, null, 120); this.tone(260, t + 0.05, 0.28, 'sawtooth', 0.06, null, 340); break
      case 'squeak': this.tone(900, t, 0.08, 'square', 0.12, null, 1800); this.tone(1700, t + 0.09, 0.12, 'square', 0.1, null, 800); break
      case 'hmm': this.voice(t, 0.5, 220 * v, 300 * v, 0.1, 5, 700); break
      case 'wake': this.voice(t, 0.35, 260 * v, 200 * v, 0.12, 6, 800); this.voice(t + 0.4, 0.45, 240 * v, 340 * v, 0.12, 6, 900); break
      case 'door': this.tone(140, t, 1.1, 'sawtooth', 0.09, null, 300); this.tone(210, t + 0.1, 0.9, 'sawtooth', 0.05, null, 140); break
      case 'light': this.tone(523, t, 0.6, 'sine', 0.12); this.tone(784, t + 0.05, 0.6, 'sine', 0.1); this.tone(1047, t + 0.1, 0.7, 'sine', 0.08); this.tone(120, t, 1.4, 'sine', 0.05); break
      case 'close': this.noise(t, 0.12, 0.2, 500, 'lowpass'); this.tone(90, t, 0.12, 'sine', 0.2); break
      case 'grab': this.tone(660 + v * 60, t, 0.08, 'triangle', 0.15); this.tone(990 + v * 90, t + 0.06, 0.12, 'triangle', 0.12); break
      case 'hug': this.voice(t, 0.8, 140, 110, 0.12, 4, 600); this.voice(t + 0.5, 0.6, 700, 1100, 0.07, 12, 1500); break
      case 'caught': {
        this.tone(110, t, 0.9, 'sawtooth', 0.12); this.tone(116.5, t, 0.9, 'sawtooth', 0.12); this.tone(220, t, 0.9, 'square', 0.06); this.noise(t, 0.4, 0.2, 2000, 'lowpass')
        this.voice(t + 0.35, 1.1, 820, 1300, 0.11, 14, 1800) // ひぃぃ〜
        break
      }
      case 'alarm': for (let k = 0; k < 14; k++) { this.tone(1400, t + k * 0.09, 0.06, 'square', 0.06); this.tone(1750, t + k * 0.09 + 0.045, 0.04, 'square', 0.05) } break
      case 'eat': for (let k = 0; k < 4; k++) this.tone(200 + (k % 2) * 40, t + k * 0.16, 0.08, 'sine', 0.2); break
      case 'yay': this.voice(t, 0.7, 420, 620, 0.09, 8, 1300); for (let k = 0; k < 5; k++) this.tone(this.mtof(76 + k * 3), t + 0.2 + k * 0.07, 0.4, 'sine', 0.06); break
      case 'drum': for (let k = 0; k < 24; k++) this.noise(t + k * 0.05, 0.05, 0.05 + k * 0.006, 1800, 'bandpass'); break
      case 'stamp': this.tone(90, t, 0.25, 'sine', 0.5, null, 40); this.noise(t, 0.18, 0.3, 1200, 'lowpass'); break
      case 'fanfare': [72, 76, 79, 84].forEach((n, k) => { this.tone(this.mtof(n), t + k * 0.11, 0.5, 'square', 0.05); this.tone(this.mtof(n) / 2, t + k * 0.11, 0.5, 'triangle', 0.08) }); break
      case 'boo': [64, 63, 62, 58].forEach((n, k) => this.tone(this.mtof(n) / 2, t + k * 0.3, 0.32, 'sawtooth', 0.07, null, this.mtof(n) / 2.1)); break
      case 'snort': this.noise(t, 0.14, 0.35, 300, 'lowpass'); this.tone(70, t, 0.16, 'sawtooth', 0.2, null, 40); break
      case 'full': this.tone(300, t, 0.15, 'square', 0.08); this.tone(240, t + 0.16, 0.2, 'square', 0.08); break
    }
  },
}
window.Snd = Snd
