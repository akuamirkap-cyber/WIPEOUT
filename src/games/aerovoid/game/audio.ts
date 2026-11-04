const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function makeNoise(ctx: AudioContext, kind: 'white' | 'brown', seconds = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  // crossfade loop seam
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    d[len - fade + i] = d[len - fade + i] * (1 - a) + d[i] * a;
  }
  return buf;
}

const BPM = 124;
const STEP = 60 / BPM / 4;
const ROOTS = [55, 43.654, 65.406, 49]; // A, F, C, G
const CHORD = [
  [0, 3, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 12],
];
const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 3, 2];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private hold = false;
  muted = false;
  musicOn = true;

  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private arpBus!: GainNode;
  private white!: AudioBuffer;

  // engine
  private o1!: OscillatorNode;
  private o2!: OscillatorNode;
  private sub!: OscillatorNode;
  private whine!: OscillatorNode;
  private whine2!: OscillatorNode;
  private engLP!: BiquadFilterNode;
  private engBus!: GainNode;
  private jetBP!: BiquadFilterNode;
  private jetGain!: GainNode;
  private shimmer!: OscillatorNode;
  // wind
  private windGain!: GainNode;
  private windLP!: BiquadFilterNode;
  private airGain!: GainNode;
  private rainGain!: GainNode;
  // boost
  private boostGain!: GainNode;
  private boostBP!: BiquadFilterNode;
  private rumbleGain!: GainNode;
  // scrape
  private scrapeGain!: GainNode;
  private scrapeBP!: BiquadFilterNode;
  private scrapeLevel = 0;
  // other ships
  private otherOsc!: OscillatorNode;
  private otherGain!: GainNode;
  private otherPan!: StereoPannerNode;
  private otherLP!: BiquadFilterNode;
  // music
  private timer = 0;
  private nextT = 0;
  private step = 0;

  start() {
    if (this.ctx) {
      if (!this.hold && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 20;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.006;
      comp.release.value = 0.22;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.white = makeNoise(ctx, 'white', 2);
      const brown = makeNoise(ctx, 'brown', 4);
      this.buildEngine(ctx, brown);
      this.buildWind(ctx, brown);
      this.buildRain(ctx);
      this.buildBoost(ctx, brown);
      this.buildScrape(ctx);
      this.buildOther(ctx);
      this.buildMusic(ctx);
    } catch {
      this.ctx = null;
    }
  }

  // ------------------------------------------------------------ builders
  /** smooth anti-grav turbine: pure tones + filtered jet roar (no low saw buzz) */
  private buildEngine(ctx: AudioContext, brown: AudioBuffer) {
    this.engBus = ctx.createGain();
    this.engBus.gain.value = 0;
    this.engBus.connect(this.sfx);
    this.engLP = ctx.createBiquadFilter();
    this.engLP.type = 'lowpass';
    this.engLP.Q.value = 0.25;
    this.engLP.frequency.value = 1400;
    this.engLP.connect(this.engBus);

    const mk = (type: OscillatorType, vol: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g);
      g.connect(this.engLP);
      o.start();
      return o;
    };
    this.o1 = mk('sine', 0.5);
    this.o2 = mk('sine', 0.5, 11); // slow beating = airy shimmer
    this.sub = mk('sine', 0.4);
    this.whine = mk('triangle', 0.16);
    this.whine2 = mk('sine', 0.1);

    // slow phasing on the upper tone
    this.shimmer = ctx.createOscillator();
    this.shimmer.type = 'sine';
    this.shimmer.frequency.value = 0.35;
    const sd = ctx.createGain();
    sd.gain.value = 7;
    this.shimmer.connect(sd);
    sd.connect(this.whine.detune);
    this.shimmer.start();

    // jet roar
    const src = ctx.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    src.playbackRate.value = 1.15;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 170;
    this.jetBP = ctx.createBiquadFilter();
    this.jetBP.type = 'bandpass';
    this.jetBP.Q.value = 0.8;
    this.jetBP.frequency.value = 600;
    this.jetGain = ctx.createGain();
    this.jetGain.gain.value = 0;
    src.connect(hp);
    hp.connect(this.jetBP);
    this.jetBP.connect(this.jetGain);
    this.jetGain.connect(this.sfx);
    src.start();
  }

  private buildWind(ctx: AudioContext, brown: AudioBuffer) {
    const src = ctx.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 70;
    this.windLP = ctx.createBiquadFilter();
    this.windLP.type = 'lowpass';
    this.windLP.frequency.value = 300;
    this.windLP.Q.value = 0.3;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(hp);
    hp.connect(this.windLP);
    this.windLP.connect(this.windGain);
    this.windGain.connect(this.sfx);
    src.start();
    // very light air layer
    const src2 = ctx.createBufferSource();
    src2.buffer = brown;
    src2.loop = true;
    src2.playbackRate.value = 1.7;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.35;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;
    src2.connect(bp);
    bp.connect(this.airGain);
    this.airGain.connect(this.sfx);
    src2.start();
  }

  private buildRain(ctx: AudioContext) {
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 480;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(this.rainGain);
    this.rainGain.connect(this.sfx);
    src.start();
  }

  private buildBoost(ctx: AudioContext, brown: AudioBuffer) {
    const src = ctx.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    src.playbackRate.value = 1.3;
    this.boostBP = ctx.createBiquadFilter();
    this.boostBP.type = 'bandpass';
    this.boostBP.frequency.value = 600;
    this.boostBP.Q.value = 0.7;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    src.connect(this.boostBP);
    this.boostBP.connect(this.boostGain);
    this.boostGain.connect(this.sfx);
    src.start();
    const r = ctx.createOscillator();
    r.type = 'sawtooth';
    r.frequency.value = 41;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    r.connect(lp);
    lp.connect(this.rumbleGain);
    this.rumbleGain.connect(this.sfx);
    r.start();
  }

  private buildScrape(ctx: AudioContext) {
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    this.scrapeBP = ctx.createBiquadFilter();
    this.scrapeBP.type = 'bandpass';
    this.scrapeBP.frequency.value = 1800;
    this.scrapeBP.Q.value = 1.6;
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    src.connect(this.scrapeBP);
    this.scrapeBP.connect(this.scrapeGain);
    this.scrapeGain.connect(this.sfx);
    src.start();
  }

  private buildOther(ctx: AudioContext) {
    this.otherOsc = ctx.createOscillator();
    this.otherOsc.type = 'triangle';
    this.otherOsc.frequency.value = 180;
    this.otherLP = ctx.createBiquadFilter();
    this.otherLP.type = 'lowpass';
    this.otherLP.frequency.value = 900;
    this.otherGain = ctx.createGain();
    this.otherGain.gain.value = 0;
    this.otherPan = ctx.createStereoPanner();
    this.otherOsc.connect(this.otherLP);
    this.otherLP.connect(this.otherGain);
    this.otherGain.connect(this.otherPan);
    this.otherPan.connect(this.sfx);
    this.otherOsc.start();
  }

  private buildMusic(ctx: AudioContext) {
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn && !this.muted ? 0.3 : 0;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2600;
    this.musicFilter.Q.value = 0.5;
    this.musicFilter.connect(this.musicBus);
    this.musicBus.connect(this.master);

    this.arpBus = ctx.createGain();
    this.arpBus.gain.value = 1;
    this.arpBus.connect(this.musicFilter);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = (60 / BPM) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    this.arpBus.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.musicFilter);

    this.nextT = ctx.currentTime + 0.15;
    this.step = 0;
    this.timer = window.setInterval(() => this.scheduler(), 30);
  }

  // ------------------------------------------------------------ music
  private scheduler() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextT < ctx.currentTime - 0.1) this.nextT = ctx.currentTime + 0.05;
    while (this.nextT < ctx.currentTime + 0.18) {
      this.playStep(this.step, this.nextT);
      this.nextT += STEP;
      this.step++;
    }
  }

  private voice(
    type: OscillatorType,
    f: number,
    t: number,
    a: number,
    d: number,
    vol: number,
    cutoff: number,
    dest: AudioNode,
    detune = 0
  ) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    o.connect(lp);
    lp.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + a + d + 0.05);
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 0.8) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.musicFilter);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  private playStep(step: number, t: number) {
    const ctx = this.ctx!;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const root = ROOTS[bar];

    if (s % 4 === 0 || (s === 10 && bar % 2 === 1)) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(s % 4 === 0 ? 0.85 : 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g);
      g.connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.32);
    }
    if (s === 4 || s === 12) {
      this.noiseHit(t, 0.22, 0.42, 'bandpass', 1700, 0.7);
      this.voice('triangle', 190, t, 0.001, 0.1, 0.25, 1200, this.musicFilter);
    }
    if (s % 2 === 0 && s % 4 !== 0) this.noiseHit(t, 0.07, 0.2, 'highpass', 7500, 0.5);
    else if (s % 2 === 1) this.noiseHit(t, 0.03, 0.07, 'highpass', 8500, 0.5);

    if (BASS[s]) {
      const f = root * (s === 6 || s === 13 ? 2 : 1);
      this.voice('sawtooth', f, t, 0.005, STEP * 3.2, 0.2, 340 + (bar % 2) * 80, this.musicFilter);
      this.voice('sine', f, t, 0.005, STEP * 3.2, 0.45, 300, this.musicFilter);
    }
    const idx = ARP[s];
    const semi = CHORD[bar][idx % 4] + (s >= 8 && idx === 3 ? 12 : 0);
    const af = root * 4 * Math.pow(2, semi / 12);
    this.voice('sawtooth', af, t, 0.004, 0.16, 0.085, 2800, this.arpBus, -6);
    this.voice('square', af, t, 0.004, 0.12, 0.03, 2200, this.arpBus, 7);

    if (s === 0) {
      for (const sm of [0, CHORD[bar][1], CHORD[bar][2]]) {
        const f = root * 4 * Math.pow(2, sm / 12);
        this.voice('sawtooth', f, t, 0.5, STEP * 14, 0.05, 900, this.musicFilter, -9);
        this.voice('sawtooth', f, t, 0.5, STEP * 14, 0.05, 900, this.musicFilter, 9);
      }
    }
  }

  // ------------------------------------------------------------ per frame
  update(speedN: number, throttle: number, boost: number, active: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const live = active && !this.muted;

    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.muted || !this.musicOn ? 0 : 0.3, t, 0.2);
    this.musicFilter.frequency.setTargetAtTime(1800 + speedN * 1400 + boost * 4200, t, 0.25);

    // engine: smooth tone stack rising with speed, jet roar underneath
    const f = 150 + speedN * 430 + boost * 140 + throttle * 40;
    this.o1.frequency.setTargetAtTime(f, t, 0.12);
    this.o2.frequency.setTargetAtTime(f, t, 0.12);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.12);
    this.whine.frequency.setTargetAtTime(f * 2, t, 0.12);
    this.whine2.frequency.setTargetAtTime(f * 3.01, t, 0.12);
    this.engLP.frequency.setTargetAtTime(900 + speedN * 2600 + boost * 1500, t, 0.15);
    this.engBus.gain.setTargetAtTime(live ? 0.05 + throttle * 0.03 + speedN * 0.04 : 0, t, 0.15);
    this.jetBP.frequency.setTargetAtTime(420 + speedN * 1500 + boost * 900, t, 0.15);
    this.jetGain.gain.setTargetAtTime(live ? 0.03 + throttle * 0.03 + speedN * 0.09 + boost * 0.05 : 0, t, 0.2);

    // soft wind
    const s2 = speedN * speedN;
    this.windGain.gain.setTargetAtTime(live ? s2 * 0.075 : 0, t, 0.35);
    this.windLP.frequency.setTargetAtTime(260 + s2 * 900, t, 0.3);
    this.airGain.gain.setTargetAtTime(live ? s2 * speedN * 0.014 : 0, t, 0.4);

    // boost bed
    this.boostGain.gain.setTargetAtTime(live ? boost * 0.1 : 0, t, 0.1);
    this.boostBP.frequency.setTargetAtTime(380 + boost * 1100, t, 0.12);
    this.rumbleGain.gain.setTargetAtTime(live ? boost * 0.12 : 0, t, 0.1);

    // scrape
    this.scrapeGain.gain.setTargetAtTime(live ? this.scrapeLevel * 0.06 : 0, t, 0.04);
    if (this.scrapeLevel > 0) this.scrapeBP.frequency.setTargetAtTime(1200 + Math.random() * 1800, t, 0.03);
  }

  setScrape(v: number) {
    this.scrapeLevel = v;
  }

  setRain(level: number) {
    if (!this.ctx) return;
    this.rainGain.gain.setTargetAtTime(this.muted ? 0 : level * 0.055, this.ctx.currentTime, 0.35);
  }

  /** nearby rival engine with stereo pan + doppler */
  updateOther(dist: number, pan: number, closing: number, speedN: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const near = clamp(1 - dist / 170, 0, 1);
    const vol = this.muted ? 0 : near * near * 0.1;
    const ratio = clamp(130 / (130 - clamp(closing, -80, 80)), 0.72, 1.4);
    this.otherOsc.frequency.setTargetAtTime((150 + speedN * 400) * ratio, t, 0.05);
    this.otherGain.gain.setTargetAtTime(vol, t, 0.08);
    this.otherPan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.06);
    this.otherLP.frequency.setTargetAtTime(500 + near * 1200, t, 0.1);
  }

  // ------------------------------------------------------------ one-shots
  private whoosh(vol: number, dur: number, f0: number, f1: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp);
    bp.connect(g);
    g.connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private sweep(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, cutoff: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  boostStart() {
    this.whoosh(0.2, 1.1, 250, 3600);
    this.sweep('sawtooth', 80, 520, 0.8, 0.07, 1000);
    this.sweep('sine', 60, 30, 0.5, 0.3, 200);
  }

  sonicBoom() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.white;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1050;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    crack.connect(hp);
    hp.connect(gain);
    gain.connect(this.sfx);
    crack.start(t, Math.random());
    crack.stop(t + 0.12);
    this.whoosh(0.24, 0.85, 260, 4600);
    this.sweep('sine', 145, 34, 0.64, 0.36, 360);
    this.sweep('triangle', 580, 125, 0.36, 0.075, 2200);
  }

  beep(freq: number, dur = 0.25, vol = 0.25) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    for (const [type, mul, v] of [
      ['sine', 1, 1],
      ['triangle', 2, 0.3],
    ] as [OscillatorType, number, number][]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq * mul;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * v * 0.7, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.sfx);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  thud(strength: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const vol = clamp(0.2 + strength * 0.012, 0.2, 0.55);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(115, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.28);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.35);
    const s = ctx.createBufferSource();
    s.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.8, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    s.connect(f);
    f.connect(ng);
    ng.connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + 0.25);
  }

  // ------------------------------------------------------------ control
  toggleMusic() {
    this.musicOn = !this.musicOn;
  }

  suspend() {
    this.hold = true;
    if (this.ctx) void this.ctx.suspend();
  }

  resume() {
    this.hold = false;
    if (this.ctx) void this.ctx.resume();
  }

  stop() {
    window.clearInterval(this.timer);
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
