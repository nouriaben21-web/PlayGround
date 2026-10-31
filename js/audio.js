export class AudioEngine {
  constructor() {
    this.ctx = null
    this.muted = false
    this.started = false
    this.engineGain = null
    this.sirenGain = null
  }

  init() {
    if (this.started) { if (this.ctx?.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    this.started = true
    this.master = ctx.createGain()
    this.master.gain.value = 0.75
    this.master.connect(ctx.destination)

    // Shared noise buffer
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      d[i] = last * 3.2
    }
    this.noise = buf

    // Engine hum
    this.engineGain = ctx.createGain()
    this.engineGain.gain.value = 0
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 380
    lp.Q.value = 3
    const o1 = ctx.createOscillator()
    o1.type = 'sawtooth'
    o1.frequency.value = 55
    const o2 = ctx.createOscillator()
    o2.type = 'square'
    o2.frequency.value = 27.5
    const g2 = ctx.createGain(); g2.gain.value = 0.4
    o1.connect(lp); o2.connect(g2); g2.connect(lp)
    lp.connect(this.engineGain); this.engineGain.connect(this.master)
    o1.start(); o2.start()
    this.engineOsc = [o1, o2]
    this.engineFilter = lp

    // Siren
    this.sirenGain = ctx.createGain()
    this.sirenGain.gain.value = 0
    const sg = ctx.createGain(); sg.gain.value = 0.18
    const s1 = ctx.createOscillator(); s1.type = 'square'; s1.frequency.value = 680
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.45
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 240
    lfo.connect(lfoGain); lfoGain.connect(s1.frequency)
    s1.connect(sg); sg.connect(this.sirenGain); this.sirenGain.connect(this.master)
    s1.start(); lfo.start()
    this.sirenOsc = s1

    // City ambience
    const amb = ctx.createBufferSource()
    amb.buffer = buf
    amb.loop = true
    const ambF = ctx.createBiquadFilter()
    ambF.type = 'lowpass'
    ambF.frequency.value = 400
    const ambG = ctx.createGain()
    ambG.gain.value = 0.05
    amb.connect(ambF); ambF.connect(ambG); ambG.connect(this.master)
    amb.start()
    this.ambience = ambG
  }

  setMuted(m) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.75
  }

  noiseBurst(dur, freq, gain, type = 'lowpass', q = 1) {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.8 + Math.random() * 0.5
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f); f.connect(g); g.connect(this.master)
    src.start(t, Math.random())
    src.stop(t + dur + 0.02)
  }

  tone(freq, dur, gain = 0.15, type = 'sine', slide = 0) {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = type
    const g = ctx.createGain()
    const t = ctx.currentTime
    o.frequency.setValueAtTime(freq, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(this.master)
    o.start(t); o.stop(t + dur + 0.02)
  }

  gunshot(kind = 'pistol') {
    this.noiseBurst(kind === 'smg' ? 0.1 : 0.18, kind === 'smg' ? 1800 : 1300, 0.5, 'bandpass', 0.7)
    this.tone(kind === 'smg' ? 120 : 82, 0.09, 0.28, 'square', -40)
    this.tone(1600, 0.03, 0.08, 'triangle', -900)
  }

  reload() {
    this.tone(520, 0.05, 0.06, 'square')
    setTimeout(() => this.tone(360, 0.05, 0.05, 'square'), 160)
  }

  footstep() {
    this.noiseBurst(0.06, 900, 0.05, 'lowpass', 0.5)
  }

  crash(intensity = 1) {
    this.noiseBurst(0.25, 500, Math.min(0.55, 0.18 + intensity * 0.25), 'lowpass', 0.8)
    this.tone(65, 0.2, 0.2, 'sine', -20)
  }

  explosion() {
    this.noiseBurst(0.9, 700, 0.75, 'lowpass', 0.5)
    this.tone(55, 0.7, 0.45, 'sine', -35)
    this.tone(120, 0.4, 0.2, 'sawtooth', -80)
  }

  bulletImpact() {
    this.noiseBurst(0.05, 2600, 0.08, 'highpass', 1)
  }

  hitFlesh() {
    this.tone(140, 0.08, 0.12, 'square', -60)
    this.noiseBurst(0.08, 500, 0.1)
  }

  missionComplete() {
    const notes = [523, 659, 784, 1046]
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.3, 0.14, 'triangle'), i * 110))
  }

  missionStart() {
    const notes = [392, 523, 659]
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.25, 0.11, 'triangle'), i * 90))
  }

  fail() {
    this.tone(220, 0.4, 0.16, 'sawtooth', -120)
    setTimeout(() => this.tone(150, 0.5, 0.14, 'sawtooth', -80), 260)
  }

  click() {
    this.tone(880, 0.04, 0.05, 'square')
  }

  update(dt, { driving, speed, throttle, wanted, sirenDist, paused }) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    if (this.engineGain) {
      const spd = Number.isFinite(speed) ? Math.abs(speed) : 0
      const target = driving && !paused ? 0.10 + Math.min(0.12, spd * 0.003) + (throttle ? 0.04 : 0) : 0
      this.engineGain.gain.setTargetAtTime(target, t, 0.08)
      if (driving) {
        const f = 42 + spd * 5.5 + (throttle ? 12 : 0)
        this.engineOsc[0].frequency.setTargetAtTime(f, t, 0.06)
        this.engineOsc[1].frequency.setTargetAtTime(f / 2, t, 0.06)
        this.engineFilter.frequency.setTargetAtTime(260 + spd * 26, t, 0.08)
      }
    }
    if (this.sirenGain) {
      let g = 0
      if (wanted > 0 && sirenDist != null) g = Math.max(0, 1 - sirenDist / 90) * 0.35
      this.sirenGain.gain.setTargetAtTime(g, t, 0.15)
    }
  }
}
