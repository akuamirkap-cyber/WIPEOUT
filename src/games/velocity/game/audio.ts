/* Procedural Web Audio engine – no external files */

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  musicBus!: GainNode;
  noiseBuf!: AudioBuffer;

  // engine
  engOsc1!: OscillatorNode;
  engOsc2!: OscillatorNode;
  engOsc3!: OscillatorNode;
  engFilter!: BiquadFilterNode;
  engGain!: GainNode;
  // wind
  windSrc!: AudioBufferSourceNode;
  windFilter!: BiquadFilterNode;
  windGain!: GainNode;
  // boost
  boostSrc!: AudioBufferSourceNode;
  boostFilter!: BiquadFilterNode;
  boostGain!: GainNode;
  boostOsc!: OscillatorNode;
  boostOscGain!: GainNode;
  // hover hum
  humOsc!: OscillatorNode;
  humGain!: GainNode;

  musicOn = true;
  musicTimer: number | null = null;
  nextNoteTime = 0;
  step = 0;
  bpm = 132;

  enabled = false;
  muted = false;

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);

    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // ---- engine: 3 detuned oscillators -> lowpass
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = "lowpass";
    this.engFilter.frequency.value = 400;
    this.engFilter.Q.value = 2;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter.connect(this.engGain).connect(this.sfx);
    const mk = (type: OscillatorType, det: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = det;
      o.frequency.value = 60;
      const g = ctx.createGain();
      g.gain.value = type === "sine" ? 0.6 : 0.35;
      o.connect(g).connect(this.engFilter);
      o.start();
      return o;
    };
    this.engOsc1 = mk("sawtooth", 0);
    this.engOsc2 = mk("sawtooth", 12);
    this.engOsc3 = mk("sine", -1200);

    // ---- hover hum
    this.humOsc = ctx.createOscillator();
    this.humOsc.type = "triangle";
    this.humOsc.frequency.value = 48;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humOsc.connect(this.humGain).connect(this.sfx);
    this.humOsc.start();

    // ---- wind
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = this.noiseBuf;
    this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter).connect(this.windGain).connect(this.sfx);
    this.windSrc.start();

    // ---- boost
    this.boostSrc = ctx.createBufferSource();
    this.boostSrc.buffer = this.noiseBuf;
    this.boostSrc.loop = true;
    this.boostFilter = ctx.createBiquadFilter();
    this.boostFilter.type = "bandpass";
    this.boostFilter.frequency.value = 1500;
    this.boostFilter.Q.value = 1.2;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    this.boostSrc.connect(this.boostFilter).connect(this.boostGain).connect(this.sfx);
    this.boostSrc.start();
    this.boostOsc = ctx.createOscillator();
    this.boostOsc.type = "sawtooth";
    this.boostOsc.frequency.value = 120;
    this.boostOscGain = ctx.createGain();
    this.boostOscGain.gain.value = 0;
    const bf = ctx.createBiquadFilter();
    bf.type = "lowpass";
    bf.frequency.value = 900;
    this.boostOsc.connect(bf).connect(this.boostOscGain).connect(this.sfx);
    this.boostOsc.start();

    this.enabled = true;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx!.currentTime, 0.05);
    return this.muted;
  }

  private smooth = { eng: 0, wind: 0, boost: 0, pitch: 60 };

  /** Called every frame */
  update(dt: number, speed: number, thrust: number, boosting: boolean, racing: boolean, airbrake: number) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const sp = Math.min(1, speed / 150);
    const k = Math.min(1, dt * 6);
    const s = this.smooth;
    // engine pitch follows speed + thrust
    const targetPitch = 55 + sp * 190 + thrust * 25 + (boosting ? 60 : 0);
    s.pitch += (targetPitch - s.pitch) * Math.min(1, dt * 3);
    this.engOsc1.frequency.setTargetAtTime(s.pitch, t, 0.05);
    this.engOsc2.frequency.setTargetAtTime(s.pitch * 1.005, t, 0.05);
    this.engOsc3.frequency.setTargetAtTime(s.pitch * 2, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(300 + sp * 1800 + thrust * 500, t, 0.08);
    const engTarget = racing ? 0.08 + thrust * 0.1 + sp * 0.08 : 0.05;
    s.eng += (engTarget - s.eng) * k;
    this.engGain.gain.setTargetAtTime(s.eng, t, 0.05);
    this.humGain.gain.setTargetAtTime(racing ? 0.05 : 0.08, t, 0.1);
    this.humOsc.frequency.setTargetAtTime(44 + sp * 20, t, 0.1);
    // wind
    const windTarget = sp * sp * 0.35 + airbrake * 0.15 * sp;
    s.wind += (windTarget - s.wind) * k;
    this.windGain.gain.setTargetAtTime(s.wind, t, 0.08);
    this.windFilter.frequency.setTargetAtTime(400 + sp * 2200 + airbrake * 800, t, 0.1);
    // boost
    const bt = boosting ? 0.5 : 0;
    s.boost += (bt - s.boost) * Math.min(1, dt * (boosting ? 10 : 4));
    this.boostGain.gain.setTargetAtTime(s.boost, t, 0.04);
    this.boostFilter.frequency.setTargetAtTime(900 + s.boost * 3200 + sp * 800, t, 0.1);
    this.boostOscGain.gain.setTargetAtTime(s.boost * 0.18, t, 0.05);
    this.boostOsc.frequency.setTargetAtTime(90 + s.boost * 220 + sp * 120, t, 0.1);
  }

  // ---------- one-shots ----------
  private blip(freq: number, dur: number, type: OscillatorType = "square", vol = 0.25, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = "bandpass") {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  countdownBeep() {
    this.blip(660, 0.18, "square", 0.22);
  }
  go() {
    this.blip(990, 0.6, "square", 0.25);
    this.blip(1320, 0.6, "sine", 0.15);
  }
  hit(intensity: number) {
    const v = Math.min(1, intensity);
    this.noiseBurst(0.25 + v * 0.2, 500, 0.8, 0.5 * v + 0.15);
    this.blip(90, 0.3, "sine", 0.5 * v + 0.1, -60);
    this.noiseBurst(0.15, 3000, 2, 0.2 * v, "highpass");
  }
  scrape(level: number) {
    if (!this.ctx) return;
    this.noiseBurst(0.08, 2500, 1.5, 0.08 * level, "highpass");
  }
  speedPad() {
    this.blip(520, 0.12, "square", 0.2);
    setTimeout(() => this.blip(780, 0.12, "square", 0.2), 70);
    setTimeout(() => this.blip(1040, 0.25, "square", 0.22), 140);
    this.noiseBurst(0.5, 2000, 1, 0.25);
  }
  energyPad() {
    this.blip(440, 0.3, "sine", 0.25, 440);
    setTimeout(() => this.blip(880, 0.4, "triangle", 0.2, 440), 120);
  }
  boostStart() {
    this.noiseBurst(0.7, 1200, 0.7, 0.55);
    this.blip(80, 0.6, "sawtooth", 0.3, 320);
  }
  boostEnd() {
    this.noiseBurst(0.3, 800, 0.8, 0.2);
  }
  boostEmpty() {
    this.blip(220, 0.15, "square", 0.15, -80);
  }
  lap() {
    [0, 90, 180].forEach((d, i) => setTimeout(() => this.blip(660 + i * 220, 0.18, "square", 0.2), d));
  }
  finish() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.5, "square", 0.22), i * 140));
    setTimeout(() => this.blip(1318, 1.2, "sine", 0.25), 600);
  }
  uiClick() {
    this.blip(1200, 0.08, "square", 0.15);
  }

  // ---------- music: minimal techno sequencer ----------
  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
  setMusicVolume(v: number) {
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }

  private bassPattern = [0, 0, 12, 0, 0, 7, 0, 10, 0, 0, 12, 0, 3, 0, 7, 5];
  private leadPattern = [-1, -1, 19, -1, 22, -1, -1, 24, -1, -1, 19, -1, -1, 26, 24, -1];
  private root = 41.2; // E1

  private schedule() {
    if (!this.ctx) return;
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number) {
    const ctx = this.ctx!;
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    // kick on quarter notes
    if (s16 % 4 === 0) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.35);
    }
    // hats on off-16ths
    if (s16 % 2 === 1 || s16 % 4 === 2) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 7000;
      const g = ctx.createGain();
      const v = s16 % 4 === 2 ? 0.25 : 0.12;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (s16 % 4 === 2 ? 0.12 : 0.05));
      src.connect(f).connect(g).connect(this.musicBus);
      src.start(t);
      src.stop(t + 0.15);
    }
    // snare/clap on 2 and 4
    if (s16 === 4 || s16 === 12) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1800;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      src.connect(f).connect(g).connect(this.musicBus);
      src.start(t);
      src.stop(t + 0.2);
    }
    // bass
    const semi = this.bassPattern[s16];
    const transpose = bar === 3 ? -2 : bar === 2 ? 3 : 0;
    if (s16 % 2 === 0 || s16 === 7 || s16 === 13) {
      const freq = this.root * Math.pow(2, (semi + transpose) / 12);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "square";
      o2.frequency.value = freq * 0.5;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(1600, t);
      f.frequency.exponentialRampToValueAtTime(180, t + 0.22);
      f.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      const g2 = ctx.createGain();
      g2.gain.value = 0.4;
      o.connect(f);
      o2.connect(g2).connect(f);
      f.connect(g).connect(this.musicBus);
      o.start(t);
      o2.start(t);
      o.stop(t + 0.3);
      o2.stop(t + 0.3);
    }
    // lead (every other 2 bars)
    const ls = this.leadPattern[s16];
    if (ls >= 0 && bar >= 2) {
      const freq = this.root * 4 * Math.pow(2, (ls + transpose) / 12);
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = freq;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      const delay = ctx.createDelay();
      delay.delayTime.value = (60 / this.bpm) * 0.75;
      const dg = ctx.createGain();
      dg.gain.value = 0.35;
      o.connect(f).connect(g);
      g.connect(this.musicBus);
      g.connect(delay).connect(dg).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.35);
    }
  }
}

export const audio = new AudioEngine();
