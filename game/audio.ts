/**
 * Everything you hear is synthesised at runtime -- there are no audio files in
 * this project. The hospital hum, the rain, the mop, the coins and the
 * walkie-talkie squelch are all built out of oscillators and shaped noise, and
 * ElevenLabs speech is pushed through the same walkie-talkie filter chain so
 * the voice sits inside the room instead of on top of it.
 */

type Ambience = "corridor" | "rain" | "street" | "room" | "none";

function noiseBuffer(ctx: AudioContext, seconds = 2) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;      // brownish, less hissy
    d[i] = last * 3.2;
  }
  return buf;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambGain!: GainNode;
  private sfxGain!: GainNode;
  private voiceGain!: GainNode;
  private noise!: AudioBuffer;
  private ambNodes: AudioNode[] = [];
  private beepTimer: number | null = null;
  private current: Ambience = "none";
  muted = false;

  async start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0.0; this.ambGain.connect(this.master);
    this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = 0.55; this.sfxGain.connect(this.master);
    this.voiceGain = ctx.createGain(); this.voiceGain.gain.value = 0.95; this.voiceGain.connect(this.master);
    this.noise = noiseBuffer(ctx, 3);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx!.currentTime, 0.05);
  }

  private loopNoise(filter: BiquadFilterNode, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.ambGain);
    src.start();
    this.ambNodes.push(src, filter, g);
    return { src, g };
  }

  setAmbience(kind: Ambience) {
    if (!this.ctx || kind === this.current) return;
    this.current = kind;
    const ctx = this.ctx;
    // fade the old bed out, then tear it down
    this.ambGain.gain.cancelScheduledValues(ctx.currentTime);
    this.ambGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
    const dying = this.ambNodes;
    this.ambNodes = [];
    window.setTimeout(() => dying.forEach((n) => { try { (n as any).stop?.(); n.disconnect(); } catch {} }), 400);
    if (this.beepTimer) { window.clearInterval(this.beepTimer); this.beepTimer = null; }
    if (kind === "none") return;

    if (kind === "corridor" || kind === "room") {
      // fluorescent tubes: a low mains buzz plus its harmonic, and air handling
      const hum = ctx.createOscillator(); hum.type = "sawtooth"; hum.frequency.value = 50;
      const humF = ctx.createBiquadFilter(); humF.type = "lowpass"; humF.frequency.value = 220;
      const humG = ctx.createGain(); humG.gain.value = kind === "room" ? 0.012 : 0.022;
      hum.connect(humF).connect(humG).connect(this.ambGain); hum.start();
      const buzz = ctx.createOscillator(); buzz.type = "square"; buzz.frequency.value = 100;
      const buzzG = ctx.createGain(); buzzG.gain.value = 0.004;
      const buzzF = ctx.createBiquadFilter(); buzzF.type = "bandpass"; buzzF.frequency.value = 2400; buzzF.Q.value = 3;
      buzz.connect(buzzF).connect(buzzG).connect(this.ambGain); buzz.start();
      const airF = ctx.createBiquadFilter(); airF.type = "lowpass"; airF.frequency.value = 380;
      this.loopNoise(airF, 0.10);
      this.ambNodes.push(hum, humF, humG, buzz, buzzF, buzzG);

      if (kind === "corridor") {
        // a monitor, several rooms away
        this.beepTimer = window.setInterval(() => this.blip(1180, 0.05, 0.035, "sine"), 4200);
      }
    }

    if (kind === "rain" || kind === "street") {
      const hi = ctx.createBiquadFilter(); hi.type = "highpass"; hi.frequency.value = 900;
      this.loopNoise(hi, kind === "rain" ? 0.34 : 0.24);
      const body = ctx.createBiquadFilter(); body.type = "bandpass";
      body.frequency.value = 380; body.Q.value = 0.6;
      this.loopNoise(body, 0.16);
      if (kind === "street") {
        const low = ctx.createBiquadFilter(); low.type = "lowpass"; low.frequency.value = 120;
        this.loopNoise(low, 0.22);            // city rumble
      }
    }

    this.ambGain.gain.setTargetAtTime(kind === "room" ? 0.5 : 0.62, ctx.currentTime, 0.5);
  }

  private blip(freq: number, dur: number, gain: number, type: OscillatorType = "sine") {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  private burst(opts: { freq: number; q: number; dur: number; gain: number; sweep?: number }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = opts.freq; f.Q.value = opts.q;
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, ctx.currentTime + opts.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(opts.gain, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + opts.dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(0, Math.random() * 2); src.stop(ctx.currentTime + opts.dur + 0.05);
  }

  mop()      { this.burst({ freq: 700, q: 0.9, dur: 0.34, gain: 0.24, sweep: 340 }); }
  step()     { this.burst({ freq: 240, q: 1.6, dur: 0.09, gain: 0.10 }); }
  coin()     { this.blip(1560, 0.09, 0.10, "triangle"); window.setTimeout(() => this.blip(2340, 0.13, 0.08, "triangle"), 55); }
  spend()    { this.blip(520, 0.10, 0.09, "triangle"); window.setTimeout(() => this.blip(300, 0.16, 0.07, "triangle"), 60); }
  click()    { this.burst({ freq: 2600, q: 2.2, dur: 0.05, gain: 0.16 }); }
  type()     { this.blip(1900 + Math.random() * 300, 0.012, 0.017, "square"); }
  door()     { this.burst({ freq: 180, q: 1.1, dur: 0.5, gain: 0.2, sweep: 90 }); }
  walkie()   { this.burst({ freq: 1800, q: 1.1, dur: 0.18, gain: 0.2, sweep: 900 }); }
  thunder()  { this.burst({ freq: 90, q: 0.5, dur: 2.2, gain: 0.5, sweep: 40 }); }

  /** 300-3400 Hz band + a little grit: the locker radio. */
  private walkieChain(): { input: AudioNode; output: AudioNode } {
    const ctx = this.ctx!;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 300;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3400;
    const peak = ctx.createBiquadFilter(); peak.type = "peaking";
    peak.frequency.value = 1700; peak.gain.value = 7; peak.Q.value = 1.1;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    hp.connect(lp).connect(peak).connect(shaper);
    return { input: hp, output: shaper };
  }

  /** Play a decoded speech clip through the walkie filter. Resolves when done. */
  async speak(data: ArrayBuffer, throughRadio = true): Promise<void> {
    await this.start();
    const ctx = this.ctx!;
    const buf = await ctx.decodeAudioData(data.slice(0));
    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      if (throughRadio) {
        const { input, output } = this.walkieChain();
        const g = ctx.createGain(); g.gain.value = 1.5;
        src.connect(input); output.connect(g).connect(this.voiceGain);
        // carrier hiss under the voice
        const hiss = ctx.createBufferSource(); hiss.buffer = this.noise; hiss.loop = true;
        const hf = ctx.createBiquadFilter(); hf.type = "bandpass"; hf.frequency.value = 2000; hf.Q.value = 0.7;
        const hg = ctx.createGain(); hg.gain.value = 0.035;
        hiss.connect(hf).connect(hg).connect(this.voiceGain); hiss.start();
        src.onended = () => { try { hiss.stop(); } catch {} resolve(); };
      } else {
        src.connect(this.voiceGain);
        src.onended = () => resolve();
      }
      this.walkie();
      src.start(ctx.currentTime + 0.16);
    });
  }
}

export const audio = new AudioEngine();
