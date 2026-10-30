// AR session: phone camera -> marker tracking -> smoothed pose of the printed cube (or the flat card),
// plus "up" from the phone's tilt sensor. Tracking logic follows the ar-cube viewer (wave84mn/ar-cube).
import { Tracker, projectedBox } from './tracker.js';
import { OneEuro, matToQuat, quatToMat, mulv } from './pose.js';

const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class ArSession {
  constructor(opts = {}) {
    this.fov = opts.fov || 66;            // camera field of view along the long side (degrees)
    this.layoutUrl = opts.layoutUrl || 'ar/layout.json';
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', ''); this.video.muted = true; this.video.autoplay = true;
    this.frame = document.createElement('canvas');        // the exact frame that was tracked; drawn as background
    this.fctx = this.frame.getContext('2d', { alpha: false });
    this.proc = document.createElement('canvas');
    this.pctx = this.proc.getContext('2d', { willReadFrequently: true });
    this.frameVersion = 0;
    this.tracker = null;
    this.running = false;
    this.sensor = { ok: false, beta: 0, gamma: 0, t: 0 };
    this.upOverride = null;               // tests
    this.T = {
      cube: { filtT: new OneEuro(3, 2.0, 0.3, 5.0), filtQ: new OneEuro(4, 2.0, 40, 5.0), raw: null, seen: -10 },
      card: { filtT: new OneEuro(3, 2.0, 0.3, 5.0), filtQ: new OneEuro(4, 2.0, 40, 5.0), raw: null, seen: -10 },
    };
    this.active = null;                   // 'cube' | 'card' | null
    this.pose = null;                     // { R, t, target, time }
    this.fps = 0; this.lastT = 0; this.n = 0; this.PROC = 640; this.cvMs = 0; this.markers = 0;
    this._onOrient = (e) => {
      if (e.beta == null || e.gamma == null) return;
      const s = this.sensor; s.ok = true; s.beta = e.beta; s.gamma = e.gamma; s.t = performance.now();
    };
  }

  // Must be called from a tap: iOS asks for the tilt sensor and the camera there.
  async start() {
    const sensorP = this._enableSensors();
    if (!window.isSecureContext) throw Object.assign(new Error('insecure'), { code: 'insecure' });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('nocamera'), { code: 'unsupported' });
    const layoutP = this.tracker ? null : fetch(this.layoutUrl).then((r) => { if (!r.ok) throw new Error('layout ' + r.status); return r.json(); });
    if (layoutP) layoutP.catch(() => {});   // reported below, after the camera starts
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
    } catch (e) {
      const name = e && e.name;
      throw Object.assign(new Error(String(e && e.message || e)), { code: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'nocamera' : 'failed' });
    }
    this.stream = stream;
    this.video.srcObject = stream;
    try { await this.video.play(); } catch { /* autoplay with muted video normally succeeds */ }
    if (layoutP) this.tracker = new Tracker(await layoutP);
    await sensorP;
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.stream) for (const tr of this.stream.getTracks()) tr.stop();
    this.stream = null; this.video.srcObject = null;
    this.active = null; this.pose = null;
    window.removeEventListener('deviceorientation', this._onOrient);
  }

  async _enableSensors() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return;
      }
      window.addEventListener('deviceorientation', this._onOrient);
    } catch { /* no sensor: fall back to "screen up is world up" */ }
  }

  get sensorOn() { return this.sensor.ok && performance.now() - this.sensor.t < 1500; }

  // World-up in OpenCV camera coordinates (x right, y down, z forward).
  upInCamera() {
    if (this.upOverride) return this.upOverride;
    if (!this.sensorOn) return [0, -1, 0];  // assume the phone is held upright
    const b = this.sensor.beta * D2R, g = this.sensor.gamma * D2R;
    const ux = -Math.cos(b) * Math.sin(g), uy = Math.sin(b), uz = Math.cos(b) * Math.cos(g);
    const th = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * D2R;
    const sx = ux * Math.cos(th) - uy * Math.sin(th), sy = ux * Math.sin(th) + uy * Math.cos(th);
    return [sx, -sy, -uz];
  }

  intrinsics() {
    const vw = this.video.videoWidth, vh = this.video.videoHeight, L = Math.max(vw, vh);
    const f = (L / 2) / Math.tan(this.fov * D2R / 2);
    return { fx: f, fy: f, cx: vw / 2, cy: vh / 2, vw, vh };
  }

  _loop() {
    const v = this.video;
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      const cb = (now) => { if (!this.running) return; try { this._onFrame(now); } catch (e) { console.error(e); } v.requestVideoFrameCallback(cb); };
      v.requestVideoFrameCallback(cb);
    } else {
      let last = -1;
      const raf = (now) => { if (!this.running) return; if (v.currentTime !== last) { last = v.currentTime; try { this._onFrame(now); } catch (e) { console.error(e); } } requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  _region(K, t) {
    const vw = K.vw, vh = K.vh, L = Math.max(vw, vh);
    for (const key of ['cube', 'card']) {
      const st = this.T[key];
      if (!st.raw || t - st.seen > Math.max(0.25, 2.5 / Math.max(this.fps, 1))) continue;
      const tg = this.tracker.targets[key];
      if (!tg) continue;
      const b = projectedBox(tg, st.raw, K);
      if (!b) continue;
      const pad = 0.35 * Math.max(b.x1 - b.x0, b.y1 - b.y0) + 24;
      const x0 = Math.max(0, Math.floor(b.x0 - pad)), y0 = Math.max(0, Math.floor(b.y0 - pad));
      const x1 = Math.min(vw, Math.ceil(b.x1 + pad)), y1 = Math.min(vh, Math.ceil(b.y1 + pad));
      if (x1 - x0 < 32 || y1 - y0 < 32) continue;
      const cellNative = tg.cell * K.fx / Math.max(50, st.raw.t[2]);
      const scale = Math.min(1, this.PROC / Math.max(x1 - x0, y1 - y0), 10 / cellNative);
      return { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0, scale, radius: clamp(Math.round(cellNative * scale), 2, 7) };
    }
    if (this.n % 2 === 0) return { sx: 0, sy: 0, sw: vw, sh: vh, scale: this.PROC / L, radius: [2, 3, 5][(this.n >> 1) % 3] };
    const cw = Math.round(vw / 2), ch = Math.round(vh / 2);
    return { sx: Math.round((vw - cw) / 2), sy: Math.round((vh - ch) / 2), sw: cw, sh: ch, scale: Math.min(1, this.PROC / Math.max(cw, ch)), radius: [3, 5][(this.n >> 1) % 2] };
  }

  _onFrame(nowMs) {
    const v = this.video, vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !this.tracker) return;
    this.n++;
    const t = nowMs / 1000;
    if (this.lastT) this.fps = this.fps * 0.9 + 0.1 / Math.max(1e-3, t - this.lastT);
    this.lastT = t;
    const K = this.intrinsics();
    if (this.frame.width !== vw || this.frame.height !== vh) { this.frame.width = vw; this.frame.height = vh; }
    this.fctx.drawImage(v, 0, 0, vw, vh);
    const r = this._region(K, t);
    const w = Math.max(16, Math.round(r.sw * r.scale)), h = Math.max(16, Math.round(r.sh * r.scale));
    if (this.proc.width !== w || this.proc.height !== h) { this.proc.width = w; this.proc.height = h; }
    const c0 = performance.now();
    this.pctx.drawImage(this.frame, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
    const img = this.pctx.getImageData(0, 0, w, h);
    const res = this.tracker.process(img.data, w, h, { x0: r.sx, y0: r.sy, scale: w / r.sw }, K, t, { radius: r.radius });
    this.cvMs = this.cvMs * 0.85 + 0.15 * (performance.now() - c0);
    if (this.n % 15 === 0) {
      if (this.cvMs > 30 && this.PROC > 400) this.PROC = Math.round(this.PROC * 0.85);
      else if (this.cvMs < 14 && this.PROC < 640) this.PROC = Math.min(640, Math.round(this.PROC * 1.1));
    }
    this.markers = res.markers.length;
    this._update(res, t);
    this.K = K;
    this.frameVersion++;
  }

  _update(res, t) {
    for (const key of ['cube', 'card']) {
      const st = this.T[key], p = res.poses[key];
      const good = p && (p.rms < 3.5 || (p.n >= 2 && p.rms < 6)) && !p.ambiguous;
      if (!good) continue;
      if (t - st.seen > 0.6) { st.filtT.reset(); st.filtQ.reset(); st.prevQ = null; }
      st.raw = p; st.seen = t;
      let qq = matToQuat(p.R);
      if (st.prevQ && qq[0] * st.prevQ[0] + qq[1] * st.prevQ[1] + qq[2] * st.prevQ[2] + qq[3] * st.prevQ[3] < 0) qq = qq.map((x) => -x);
      st.prevQ = qq;
      const qf = st.filtQ.filter(qq, t), tf = st.filtT.filter(p.t, t);
      const nq = Math.hypot(...qf);
      st.q = qf.map((x) => x / nq); st.t = tf;
    }
    const visible = (k) => this.T[k].raw && t - this.T[k].seen < Math.max(0.3, 2.5 / Math.max(this.fps, 1));
    this.active = visible('cube') ? 'cube' : visible('card') ? 'card' : null;
    if (this.active) {
      const st = this.T[this.active];
      this.pose = { R: quatToMat(st.q), t: st.t.slice(), target: this.active, time: performance.now() / 1000 };
    }
  }

  // Seconds since the cube (or card) was last seen.
  get age() { return this.pose && this.active ? performance.now() / 1000 - this.pose.time : Infinity; }
  get tracking() { return !!this.active && this.age < 0.35; }
  get edge() { return this.tracker ? this.tracker.layout.edge : 70; }
}

