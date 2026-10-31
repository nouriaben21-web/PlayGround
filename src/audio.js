import { clamp } from './noise.js'

export class SeaAudio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.ready = false
    this.nextGull = 6
    this.nextThunder = 20
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = this.ctx = new AC()
    this.master = ctx.createGain()
    this.master.gain.value = 0.75
    this.master.connect(ctx.destination)

    // noise loop used by sea and wind
    const len = ctx.sampleRate * 3
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 2.4
    }
    this.noiseBuffer = buffer

    this.seaSource = ctx.createBufferSource()
    this.seaSource.buffer = buffer
    this.seaSource.loop = true
    this.seaFilter = ctx.createBiquadFilter()
    this.seaFilter.type = 'lowpass'
    this.seaFilter.frequency.value = 420
    this.seaFilter.Q.value = 0.4
    this.seaGain = ctx.createGain()
    this.seaGain.gain.value = 0.18
    this.seaSource.connect(this.seaFilter).connect(this.seaGain).connect(this.master)
    this.seaSource.start()

    this.windSource = ctx.createBufferSource()
    this.windSource.buffer = buffer
    this.windSource.loop = true
    this.windSource.playbackRate.value = 1.3
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 900
    this.windFilter.Q.value = 0.6
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0.02
    this.windSource.connect(this.windFilter).connect(this.windGain).connect(this.master)
    this.windSource.start()

    // low hull drone
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0.02
    this.droneGain.connect(this.master)
    this.drone = ctx.createOscillator()
    this.drone.type = 'sine'
    this.drone.frequency.value = 55
    this.drone.connect(this.droneGain)
    this.drone.start()

    this.ready = true
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.75, this.ctx.currentTime, 0.08)
  }

  tone(freq, dur, type = 'sine', gain = 0.06, delay = 0) {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  glide(freqA, freqB, dur, type = 'sine', gain = 0.05) {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freqA, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.03)
  }

  gull() {
    if (!this.ctx || this.muted) return
    const base = 900 + Math.random() * 500
    this.glide(base, base * 0.55, 0.18, 'triangle', 0.025)
    setTimeout(() => this.glide(base * 0.9, base * 0.5, 0.22, 'triangle', 0.018), 190)
  }

  chime() {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((n, i) => this.tone(n, 0.5, 'sine', 0.05, i * 0.075))
  }

  discovery() {
    ;[392, 523.25, 659.25, 783.99].forEach((n, i) => this.tone(n, 0.9, 'triangle', 0.045, i * 0.11))
  }

  chest() {
    this.tone(130, 0.35, 'sawtooth', 0.03)
    setTimeout(() => this.chime(), 120)
  }

  horn() {
    if (!this.ctx || this.muted) return
    this.glide(110, 82, 1.6, 'sawtooth', 0.05)
    this.glide(165, 124, 1.5, 'triangle', 0.03)
  }

  splash() {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.playbackRate.value = 1.8
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 1200
    filter.Q.value = 0.8
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + 0.55)
  }

  thunder() {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    src.playbackRate.value = 0.4
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 160
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.34, t + 0.08)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t)
    src.stop(t + 3.8)
    this.glide(60, 40, 2.5, 'sine', 0.05)
  }

  coin() {
    this.tone(880, 0.14, 'sine', 0.035)
    this.tone(1320, 0.22, 'sine', 0.025, 0.06)
  }

  update(dt, { speed = 0, storm = 0, night = 0, nearIsland = false } = {}) {
    if (!this.ready) return
    const t = this.ctx.currentTime
    const s = clamp(speed / 20, 0, 1)
    this.seaGain.gain.setTargetAtTime(0.15 + storm * 0.22 + s * 0.08, t, 0.4)
    this.seaFilter.frequency.setTargetAtTime(380 + storm * 240 + s * 140, t, 0.5)
    this.windGain.gain.setTargetAtTime(0.015 + s * 0.05 + storm * 0.09, t, 0.5)
    this.windFilter.frequency.setTargetAtTime(700 + s * 900 + storm * 500, t, 0.5)
    this.droneGain.gain.setTargetAtTime(0.01 + s * 0.02 + night * 0.004, t, 0.5)
    this.drone.frequency.setTargetAtTime(52 + s * 10, t, 0.8)

    this.nextGull -= dt
    if (nearIsland && this.nextGull <= 0) {
      this.nextGull = 7 + Math.random() * 13
      this.gull()
    }
    this.nextThunder -= dt
    if (storm > 0.6 && this.nextThunder <= 0) {
      this.nextThunder = 7 + Math.random() * 10
    }
  }
}
