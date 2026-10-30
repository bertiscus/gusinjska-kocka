// ===== Gusinjska kocka — sound, synthesised in the browser (no audio files) =====
// All musical notes come from one D-major pentatonic scale, so chimes, the fanfare and
// the star dings always sound good together, in any order.

export const SCALE = [0, 2, 4, 7, 9];
export const noteHz = (step, base = 587.33) =>
  base * Math.pow(2, (Math.floor(step / 5) * 12 + SCALE[((step % 5) + 5) % 5]) / 12);

export class SoundKit {
  constructor(ctx, { ambience = true } = {}) {
    const c = (this.c = ctx);
    // master chain: gentle compressor keeps overlapping sounds from getting harsh
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -20; this.comp.knee.value = 12; this.comp.ratio.value = 3;
    this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(this.comp);
    // small "mountain air" reverb from a generated impulse
    const len = Math.floor(c.sampleRate * 1.8), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const verb = c.createConvolver(); verb.buffer = ir;
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.3;
    const verbOut = c.createGain(); verbOut.gain.value = 0.55;
    this.verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(this.master);
    // shared noise
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // rolling: soft low rumble that follows the ball's speed
    const rs = c.createBufferSource(); rs.buffer = this.noise; rs.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 0.9;
    const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 900;
    const rg = c.createGain(); rg.gain.value = 0;
    rs.connect(lp); lp.connect(lp2); lp2.connect(rg); rg.connect(this.master); rs.start();
    this.rolling = { lp, g: rg, level: 0 };
    this.lastBump = -1;
    this.birdIn = 3;
    this.ambience = ambience;
    if (ambience) this.startWind();
  }

  get now() { return this.c.currentTime; }
  setMuted(m) { this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.now, 0.03); this.muted = m; }

  // ---- building blocks ----
  env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  route(g, verb) {
    g.connect(this.master);
    if (verb) { const s = this.c.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verbIn); }
  }
  tone(type, f, t0, dur, peak, { a = 0.006, to = null, verb = 0, detune = 0 } = {}) {
    const o = this.c.createOscillator(), g = this.c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.85);
    this.env(g, t0, a, peak, dur);
    o.connect(g); this.route(g, verb);
    o.start(t0); o.stop(t0 + a + dur + 0.05);
  }
  // soft bell: sine fundamental plus a few quiet, slightly inharmonic partials
  bell(f, t0, peak = 0.1, dur = 1.3, verb = 0.7) {
    [[1, 1], [2.0, 0.32], [3.01, 0.14], [4.16, 0.06]].forEach(([m, k], i) =>
      this.tone('sine', f * m, t0, dur / (1 + i * 0.7), peak * k, { a: 0.004, verb }));
  }
  hiss(t0, dur, peak, type, f0, f1 = null, q = 0.8, verb = 0) {
    const s = this.c.createBufferSource(), f = this.c.createBiquadFilter(), g = this.c.createGain();
    s.buffer = this.noise; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    this.env(g, t0, Math.min(0.02, dur / 4), peak, dur);
    s.connect(f); f.connect(g); this.route(g, verb);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }

  // ---- game sounds ----
  // Building visited: a two-note chime that climbs the scale with every building.
  visit(n = 1, at = 0) {
    const t = this.now + at, s = Math.max(0, n - 1);
    this.bell(noteHz(s), t, 0.12, 1.3);
    this.bell(noteHz(s + 2), t + 0.1, 0.1, 1.5);
    this.bell(noteHz(s + 5), t + 0.21, 0.04, 1.2);
  }
  // Level finished: a little rising tune and a warm chord underneath.
  complete(at = 0) {
    const t = this.now + at;
    [0, 1, 2, 3, 5].forEach((s, i) => this.bell(noteHz(s), t + i * 0.1, 0.085, 1.0));
    [5, 7, 9].forEach((s) => this.bell(noteHz(s), t + 0.55, 0.06, 2.0));
    [-5, -3, 0].forEach((s) => this.tone('triangle', noteHz(s) / 2, t + 0.5, 1.6, 0.035, { a: 0.12, verb: 0.4 }));
  }
  // One ding per star on the results card, each a step higher.
  star(i = 0, at = 0) { this.bell(noteHz(5 + i * 2), this.now + at, 0.09, 1.1); }
  // Ball hits a stone wall (soft wooden "tok") or brushes a pine (rustle).
  bump(speed = 2, tree = false) {
    const t = this.now;
    if (t - this.lastBump < 0.06) return;
    this.lastBump = t;
    const k = Math.min(1, Math.max(0.15, (speed - 1) / 4));
    if (tree) {
      this.hiss(t, 0.16, 0.08 * k + 0.015, 'highpass', 3500, 1800, 0.7);
      this.hiss(t + 0.05, 0.12, 0.05 * k + 0.012, 'bandpass', 5000, 2500, 1.2);
      return;
    }
    const f = 170 + Math.random() * 40;
    this.tone('sine', f, t, 0.1, 0.22 * k + 0.03, { a: 0.002, to: f * 0.55 });
    this.tone('triangle', f * 2.7, t, 0.03, 0.05 * k, { a: 0.001 });
    this.hiss(t, 0.03, 0.05 * k, 'bandpass', 2000, null, 1.5);
  }
  // Water: a round "bloop" with a splash and a little drip after.
  splash() {
    const t = this.now;
    this.tone('sine', 380, t, 0.11, 0.3, { a: 0.003, to: 1050 });
    this.hiss(t + 0.02, 0.45, 0.2, 'lowpass', 2400, 320, 0.7, 0.3);
    this.tone('sine', 900, t + 0.2, 0.06, 0.07, { a: 0.002, to: 1500, verb: 0.4 });
    this.tone('sine', 1150, t + 0.33, 0.05, 0.045, { a: 0.002, to: 1800, verb: 0.5 });
  }
  // Ball pops back at the last door.
  respawn() { const t = this.now; [0, 2, 4].forEach((s, i) => this.bell(noteHz(s + 5), t + i * 0.06, 0.035, 0.5, 0.5)); }
  // Ball rolls over an edge onto the next face.
  cross() { this.hiss(this.now, 0.3, 0.18, 'bandpass', 380, 1500, 1.1, 0.2); }
  // Cube turned by a button.
  spin() { this.hiss(this.now, 0.34, 0.15, 'bandpass', 260, 760, 0.9, 0.2); }
  // "Poravnaj": the cube settles flat.
  level() { const t = this.now; this.bell(noteHz(4), t, 0.045, 0.5, 0.4); this.bell(noteHz(2), t + 0.08, 0.04, 0.7, 0.4); }
  // Level starts.
  go() { const t = this.now; this.bell(noteHz(-5), t, 0.07, 1.2); this.bell(noteHz(-3), t + 0.12, 0.06, 1.4); }
  // Any button.
  click() { const t = this.now; this.tone('sine', 1250, t, 0.035, 0.12, { a: 0.002 }); this.tone('sine', 2500, t, 0.02, 0.035, { a: 0.001 }); }

  // ---- continuous ----
  roll(speed) {
    const r = this.rolling, t = this.now;
    const x = Math.min(1, Math.max(0, speed / 6));
    const target = x < 0.02 ? 0 : 0.095 * Math.pow(x, 1.1) * (0.8 + 0.4 * Math.random());
    r.g.gain.setTargetAtTime(target, t, 0.05);
    r.lp.frequency.setTargetAtTime(140 + speed * 95, t, 0.06);
  }
  startWind() {
    const c = this.c;
    const ws = c.createBufferSource(); ws.buffer = this.noise; ws.loop = true; ws.playbackRate.value = 0.5;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 480; wf.Q.value = 0.5;
    const wg = c.createGain(); wg.gain.value = 0.016;
    const l1 = c.createOscillator(), l1g = c.createGain(); l1.frequency.value = 0.07; l1g.gain.value = 0.01;
    const l2 = c.createOscillator(), l2g = c.createGain(); l2.frequency.value = 0.11; l2g.gain.value = 180;
    l1.connect(l1g); l1g.connect(wg.gain); l2.connect(l2g); l2g.connect(wf.frequency);
    ws.connect(wf); wf.connect(wg); wg.connect(this.master);
    ws.start(); l1.start(); l2.start();
  }
  // A short song-bird phrase, now and then.
  bird(at = 0) {
    const t = this.now + at, n = 2 + Math.floor(Math.random() * 3), f = 2400 + Math.random() * 1400;
    const pan = this.c.createStereoPanner ? this.c.createStereoPanner() : null;
    for (let i = 0; i < n; i++) {
      const o = this.c.createOscillator(), g = this.c.createGain(), t0 = t + i * (0.09 + Math.random() * 0.05);
      const f0 = f * (1 + (Math.random() - 0.5) * 0.12);
      o.type = 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.3), t0 + 0.06);
      this.env(g, t0, 0.008, 0.02 + Math.random() * 0.015, 0.07);
      o.connect(g);
      if (pan) { g.connect(pan); } else this.route(g, 0.5);
      o.start(t0); o.stop(t0 + 0.12);
    }
    if (pan) { pan.pan.value = Math.random() * 1.4 - 0.7; pan.connect(this.master); const s = this.c.createGain(); s.gain.value = 0.5; pan.connect(s); s.connect(this.verbIn); }
  }
  tick(dt) {
    if (!this.ambience || this.muted) return;
    this.birdIn -= dt;
    if (this.birdIn <= 0) { this.bird(); this.birdIn = 5 + Math.random() * 9; }
  }
}
