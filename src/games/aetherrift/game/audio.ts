export class AudioFX {
  ctx: AudioContext | null = null;
  master!: GainNode;
  engineOsc!: OscillatorNode;
  engineOsc2!: OscillatorNode;
  engineGain!: GainNode;
  engineFilter!: BiquadFilterNode;
  windGain!: GainNode;
  windFilter!: BiquadFilterNode;
  nitroGain!: GainNode;
  nitroFilter!: BiquadFilterNode;
  muted = false;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 600;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = "square";
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();

    // noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const mkNoise = () => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      return s;
    };
    const wind = mkNoise();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 800;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    wind.start();

    const nz = mkNoise();
    this.nitroFilter = ctx.createBiquadFilter();
    this.nitroFilter.type = "lowpass";
    this.nitroFilter.frequency.value = 1500;
    this.nitroGain = ctx.createGain();
    this.nitroGain.gain.value = 0;
    nz.connect(this.nitroFilter);
    this.nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.master);
    nz.start();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  update(speedN: number, throttle: number, nitro: number, active: boolean) {
    if (!this.ctx) return;
    const c01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
    speedN = c01(speedN);
    throttle = c01(throttle);
    nitro = c01(nitro);
    const t = this.ctx.currentTime;
    const on = active ? 1 : 0;
    const f = 48 + speedN * 120 + nitro * 60 + throttle * 20;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.5 + 3, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(350 + speedN * 1400 + nitro * 1800, t, 0.08);
    this.engineGain.gain.setTargetAtTime(on * (0.05 + throttle * 0.05 + speedN * 0.04), t, 0.1);
    this.windGain.gain.setTargetAtTime(on * (speedN * speedN * 0.22 + nitro * 0.08), t, 0.1);
    this.windFilter.frequency.setTargetAtTime(500 + speedN * 1800, t, 0.1);
    this.nitroGain.gain.setTargetAtTime(on * nitro * 0.28, t, 0.05);
    this.nitroFilter.frequency.setTargetAtTime(900 + nitro * 2500, t, 0.1);
  }

  beep(freq: number, dur = 0.18, vol = 0.3, type: OscillatorType = "square") {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hit(intensity: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g.gain.setValueAtTime(Math.min(0.5, 0.1 + intensity * 0.4), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.32);
  }

  pickup() {
    this.beep(660, 0.1, 0.18, "sine");
    setTimeout(() => this.beep(990, 0.18, 0.18, "sine"), 70);
  }

  boost() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.5);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.65);
  }
}
