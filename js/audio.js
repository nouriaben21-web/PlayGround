// Tiny synthesised audio: engine, siren and one-shot effects. No audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.engine = null;
    this.siren = null;
    this.sirenPhase = 0;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // One second of noise for crashes and gunshots.
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  async start() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.started) return;
    this.started = true;

    const engGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 2.4;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;
    osc.connect(filter);
    filter.connect(engGain);
    engGain.connect(this.master);
    engGain.gain.value = 0;
    osc.start();
    this.engine = { osc, gain: engGain, filter };

    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 660;
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1400;
    sirenOsc.connect(sirenFilter);
    sirenFilter.connect(sirenGain);
    sirenGain.connect(this.master);
    sirenOsc.start();
    this.siren = { osc: sirenOsc, gain: sirenGain, phase: 0 };
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  update(dt, { driving, speed, siren }) {
    if (!this.ctx) return;
    if (this.engine) {
      const t = this.ctx.currentTime;
      const target = driving ? 0.08 + Math.min(0.1, Math.abs(speed) / 4200) : 0;
      this.engine.gain.gain.setTargetAtTime(target, t, 0.08);
      this.engine.osc.frequency.setTargetAtTime(46 + Math.abs(speed) * 0.33, t, 0.08);
      this.engine.filter.frequency.setTargetAtTime(420 + Math.abs(speed) * 1.1, t, 0.1);
    }
    if (this.siren) {
      const t = this.ctx.currentTime;
      this.siren.gain.gain.setTargetAtTime(siren > 0 ? 0.035 : 0, t, 0.15);
      this.siren.phase += dt;
      if (this.siren.phase > 0.55) this.siren.phase = 0;
      const hi = this.siren.phase < 0.27;
      this.siren.osc.frequency.setTargetAtTime(hi ? 780 : 560, t, 0.02);
    }
  }

  burst({ dur = 0.18, freq = 900, q = 1, vol = 0.5, type = 'lowpass' }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  gunshot() {
    this.burst({ dur: 0.14, freq: 1600, vol: 0.35 });
    this.burst({ dur: 0.1, freq: 220, vol: 0.3 });
  }

  crash(power = 1) {
    this.burst({ dur: 0.3, freq: 340, vol: 0.18 + 0.25 * power });
    this.burst({ dur: 0.18, freq: 90, vol: 0.3 * power });
  }

  explosion() {
    this.burst({ dur: 0.9, freq: 420, vol: 0.65 });
    this.burst({ dur: 0.7, freq: 70, vol: 0.5 });
  }

  ping(freq = 880) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.12);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  mission() {
    this.ping(660);
    setTimeout(() => this.ping(990), 120);
  }

  hurt() {
    this.burst({ dur: 0.25, freq: 180, vol: 0.25 });
  }
}
