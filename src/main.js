// ===== Gusinjska kocka — scene, input and screens =====
import { N, H, BALL_R, FACES, LEVELS, PARS, BUILDINGS, parseLevel, Game, makeAutopilot, tileU, tileV, isSolidChar, isDoorChar, isBuildingChar, v3, stars, facePoint } from './core.js';
import { q, m4, MeshBuilder, Renderer, hex, jitter, shade, mulberry } from './render.js';

// ---------- text ----------
const TXT = {
  me: {
    tagline: 'Nagni kocku i otkotrljaj kuglu do gusinjskih građevina.',
    play: 'Igraj', level: 'Nivo', locked: 'Zaključano', best: 'Najbolje',
    hint: 'Prevuci prstom preko ekrana. Kocka se naginje, a kugla se kotrlja nizbrdo.',
    goal: 'Dovedi kuglu do vrata svake građevine.',
    visited: 'Posjećeno', splash: 'Pljus! Probaj ponovo.',
    complete: 'Bravo!', time: 'Vrijeme', next: 'Sljedeći nivo', again: 'Ponovo', levels: 'Nivoi',
    spinL: 'Okreni kocku ulijevo', spinR: 'Okreni kocku udesno', flat: 'Poravnaj', flatLabel: 'Poravnaj stranu s kuglom',
    restart: 'Kreni iz početka', soundOn: 'Isključi zvuk', soundOff: 'Uključi zvuk', menu: 'Nivoi',
    note: 'Kratke priče o građevinama stižu uskoro.',
    stub: 'Kratka priča o ovoj građevini stiže uskoro.',
    loading: 'Učitavam 3D modele… {n}/{t}',
    loadFail: 'Neki modeli se nisu učitali. Provjeri internet i osvježi stranicu.',
    par: 'Tri zvjezdice: do {par} s', newBest: 'Novi rekord', allDone: 'Svi nivoi su završeni.',
    noGL: 'Ovaj preglednik ne može prikazati 3D. Probaj u Chromeu ili Safariju.',
    keys: 'Tastatura: strelice naginju, Q i E okreću, razmak poravnava.',
  },
  en: {
    tagline: 'Tilt the cube and roll the ball to the landmarks of Gusinje.',
    play: 'Play', level: 'Level', locked: 'Locked', best: 'Best',
    hint: 'Drag across the screen. The cube tilts and the ball rolls downhill.',
    goal: 'Roll the ball to the door of every building.',
    visited: 'Visited', splash: 'Splash! Try again.',
    complete: 'Well done!', time: 'Time', next: 'Next level', again: 'Again', levels: 'Levels',
    spinL: 'Turn the cube left', spinR: 'Turn the cube right', flat: 'Level', flatLabel: 'Level the ball’s face',
    restart: 'Start over', soundOn: 'Mute', soundOff: 'Unmute', menu: 'Levels',
    note: 'Short stories about the buildings are coming soon.',
    stub: 'A short story about this building is coming soon.',
    loading: 'Loading 3D models… {n}/{t}',
    loadFail: 'Some models didn’t load. Check the connection and reload the page.',
    par: 'Three stars: {par} s or less', newBest: 'New best', allDone: 'All levels complete.',
    noGL: 'This browser can’t show 3D. Try Chrome or Safari.',
    keys: 'Keyboard: arrows tilt, Q and E turn, space levels.',
  },
};

// ---------- persistent progress (per browser) ----------
const STORE = 'gusinjska-kocka/v1';
function loadSave() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function writeSave() { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch { /* storage unavailable */ } }
const save = Object.assign({ done: {}, muted: false, lang: null }, loadSave());
let lang = save.lang || (/^(sr|bs|hr|me|cnr|sh)/i.test(navigator.language || '') ? 'me' : 'en');
const t = (k) => TXT[lang][k];

// ---------- colours of the little world ----------
const C = {
  grass: hex('#7fa35b'), grass2: hex('#77a055'), earth: hex('#675c4b'), paving: hex('#aaa395'),
  stone: hex('#aba494'), stoneDark: hex('#8d8676'), kula: hex('#b9b09f'), water: hex('#38a3b5'), bank: hex('#5c5344'),
  slab: hex('#ccc5b5'), pine: hex('#34603e'), pineTop: hex('#477a4a'), trunk: hex('#6a4a33'),
  wood: hex('#80593a'), woodDark: hex('#56392a'), plaster: hex('#ebe6da'), roof: hex('#5e4b3f'), shingle: hex('#6b5a4c'),
  lead: hex('#7d8d93'), gold: hex('#d8a43a'), dark: hex('#2a2621'), teal: hex('#0f8f8a'),
  ballA: hex('#c9412c'), ballB: hex('#f3eee2'),
};
const TEAL = [0.06, 0.62, 0.60, 0.65], GOLD = [0.92, 0.70, 0.22, 0.75];

// ---------- buildings: scanned models ----------
// Each building is a photo-scanned model in models/<id>.json (mesh) + models/<id>.jpg (texture),
// made with tools/convert.py. Model space: metres or mm as scanned, Y up, base at y = 0, door facing +Z.
const SCANS = {};
const MAX_H = 4.0; // tallest a building may stand, in tiles

function parseModel(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'GKM1') throw new Error('not a model file');
  const hl = dv.getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  let off = 8 + hl;
  const take = (T, n, size) => { const a = new T(buf, off, n); off += Math.ceil((n * size) / 4) * 4; return a; };
  const qp = take(Uint16Array, head.nv * 3, 2), qu = take(Uint16Array, head.nv * 2, 2), qn = take(Int8Array, head.nv * 4, 1);
  const idx = head.idx32 ? take(Uint32Array, head.nf * 3, 4) : take(Uint16Array, head.nf * 3, 2);
  const lo = head.min, span = head.max.map((v, i) => v - lo[i]);
  const pos = new Float32Array(head.nv * 3), nor = new Float32Array(head.nv * 3), uv = new Float32Array(head.nv * 2);
  for (let i = 0; i < head.nv; i++) {
    for (let k = 0; k < 3; k++) { pos[3 * i + k] = lo[k] + (qp[3 * i + k] / 65535) * span[k]; nor[3 * i + k] = qn[4 * i + k] / 127; }
    uv[2 * i] = qu[2 * i] / 65535; uv[2 * i + 1] = qu[2 * i + 1] / 65535;
  }
  return { pos, nor, uv, idx, idx32: !!head.idx32, size: span, min: lo };
}
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image ' + src)); im.src = src; });
}
let scansDone = 0, scansFailed = 0;
async function loadScan(id) {
  if (SCANS[id]) return SCANS[id];
  const entry = SCANS[id] = { ready: false };
  try {
    const [buf, img] = await Promise.all([fetch(`models/${id}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => { const b = atob(j.data), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }), loadImage(`models/${id}.jpg`)]);
    const m = parseModel(buf);
    Object.assign(entry, { mesh: R.uploadModel(m), tex: R.texture(img), size: m.size, ready: true });
  } catch (err) { entry.failed = true; scansFailed++; console.warn('model', id, err); }
  scansDone++;
  updateLoadNote();
  return entry;
}
function loadAllScans() {
  const ids = [...new Set(Object.values(BUILDINGS).map((b) => b.id))];
  scansTotal = ids.length;
  ids.forEach((id) => loadScan(id));
}
let scansTotal = 0;
function updateLoadNote() {
  const el = $('note'); if (!el) return;
  if (scansDone < scansTotal) el.textContent = t('loading').replace('{n}', scansDone).replace('{t}', scansTotal);
  else el.textContent = scansFailed ? t('loadFail') : t('note');
}
const fitScale = (size, W, D) => Math.min((W - 0.3) / size[0], (D - 0.3) / size[2], MAX_H / size[1]);

// Plain stone block shown only while a model is still loading.
function placeholderModel(mb, W, D) {
  const hx = W * 0.36, hz = D * 0.36, h = 0.9;
  mb.box(0, h / 2, 0, hx, h / 2, hz, C.stone);
  mb.frustum(0, 0, h, h + 0.6, Math.max(hx, hz) * Math.SQRT2 + 0.1, 0, 4, C.roof, 0, Math.PI / 4);
  return { height: h + 0.6 };
}

// ---------- world mesh for a level ----------
function faceFrame(f) { const F = FACES[f]; return { o: v3.scale(F.n, H), X: F.u, Y: F.n, Z: v3.cross(F.u, F.n) }; }

function buildWorld(L, seed) {
  const rnd = mulberry(seed);
  const mb = new MeshBuilder();
  const tall = (c) => (c === '#' || isBuildingChar(c) ? 1 : c === 'T' ? 0.5 : 0);
  for (let f = 0; f < 6; f++) {
    const fr = faceFrame(f); mb.setFrame(fr.o, fr.X, fr.Y, fr.Z);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = L.at(f, i, j), x = tileU(i), z = -tileV(j);
      if (c === '~') {
        mb.poly([[x - 0.5, -0.07, z - 0.5], [x - 0.5, -0.07, z + 0.5], [x + 0.5, -0.07, z + 0.5], [x + 0.5, -0.07, z - 0.5]], jitter(C.water, 0.03, rnd), 1, [x, -1, z]);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (L.ufChar(f, i + di, j + dj) === '~') continue;
          const ex = x + di * 0.5, ez = z + dj * 0.5;
          const a = dj === 0 ? [[ex, 0, z - 0.5], [ex, 0, z + 0.5], [ex, -0.07, z + 0.5], [ex, -0.07, z - 0.5]] : [[x - 0.5, 0, ez], [x + 0.5, 0, ez], [x + 0.5, -0.07, ez], [x - 0.5, -0.07, ez]];
          mb.poly(a, C.bank, 0, [ex + di, -0.03, ez + dj]);
        }
        continue;
      }
      // floor with soft corner shading
      let base = isSolidChar(c) ? (c === '#' ? C.earth : C.paving) : ((i + j) % 2 ? C.grass : C.grass2);
      base = jitter(base, 0.035, rnd);
      const cols = [], pts = [];
      for (const [ci, cj] of [[0, 0], [0, 1], [1, 1], [1, 0]]) {
        const si = ci ? 1 : -1, sj = cj ? 1 : -1;
        const occ = tall(L.ufChar(f, i + si, j)) + tall(L.ufChar(f, i, j + sj)) + tall(L.ufChar(f, i + si, j + sj));
        cols.push(shade(base, 1 - 0.11 * Math.min(occ, 2.5)));
        pts.push([-H + i + ci, 0, j + cj - H]);
      }
      mb.poly(pts, base, 0, [x, -1, z], cols);
      if (c === '#') {
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
          const hx = 0.25 - 0.018 - rnd() * 0.022, hz = 0.25 - 0.018 - rnd() * 0.022, h = 0.4 + rnd() * 0.2;
          const cx = x + (a - 0.5) * 0.5 + (rnd() - 0.5) * 0.02, cz = z + (b - 0.5) * 0.5 + (rnd() - 0.5) * 0.02;
          mb.box(cx, h / 2, cz, hx, h / 2, hz, jitter(rnd() < 0.55 ? C.stone : C.stoneDark, 0.07, rnd));
        }
      } else if (c === 'T') {
        const s = 0.86 + rnd() * 0.28, ox = x + (rnd() - 0.5) * 0.1, oz = z + (rnd() - 0.5) * 0.1, r = rnd() * 6.3;
        mb.box(ox, 0.1 * s, oz, 0.05, 0.1 * s, 0.05, C.trunk);
        mb.frustum(ox, oz, 0.14 * s, 0.62 * s, 0.34 * s, 0, 7, jitter(C.pine, 0.06, rnd), 0, r);
        mb.frustum(ox, oz, 0.44 * s, 0.92 * s, 0.27 * s, 0, 7, jitter(C.pine, 0.06, rnd), 0, r + 0.4);
        mb.frustum(ox, oz, 0.72 * s, 1.18 * s, 0.19 * s, 0, 7, jitter(C.pineTop, 0.05, rnd), 0, r + 0.8);
      } else if (c === '@') {
        mb.frustum(x, z, 0, 0.035, 0.38, 0.35, 12, C.slab);
      } else if (isDoorChar(c)) {
        mb.box(x, 0.022, z, 0.43, 0.022, 0.43, C.slab);
      }
    }
  }
  const world = { mesh: mb, buildings: [], doors: [] };
  for (const b of L.buildings) {
    const F = FACES[b.f];
    const Z = v3.add(v3.scale(F.u, b.face[0]), v3.scale(F.v, b.face[1]));
    const Y = F.n, X = v3.cross(Y, Z);
    const alongU = b.face[0] !== 0;
    const ext = [b.i1 - b.i0 + 1, b.j1 - b.j0 + 1];
    const W = alongU ? ext[1] : ext[0], D = alongU ? ext[0] : ext[1];
    const o = facePoint(b.f, b.cu, b.cv);
    const bm = new MeshBuilder().setFrame(o, X, Y, Z);
    const info = placeholderModel(bm, W, D);
    world.buildings.push({ b, mesh: bm, W, D, placeholderH: info.height, frame: { X, Y, Z, o } });
    // door ring
    const dfr = faceFrame(b.door.f);
    const rm = new MeshBuilder().setFrame(dfr.o, dfr.X, dfr.Y, dfr.Z);
    const dx = tileU(b.door.i), dz = -tileV(b.door.j), segs = 20;
    for (let k = 0; k < segs; k++) {
      const a0 = k / segs * Math.PI * 2, a1 = (k + 1) / segs * Math.PI * 2;
      rm.poly([[dx + Math.cos(a0) * 0.27, 0.05, dz + Math.sin(a0) * 0.27], [dx + Math.cos(a0) * 0.37, 0.05, dz + Math.sin(a0) * 0.37], [dx + Math.cos(a1) * 0.37, 0.05, dz + Math.sin(a1) * 0.37], [dx + Math.cos(a1) * 0.27, 0.05, dz + Math.sin(a1) * 0.27]], C.teal, 2, [dx, -1, dz]);
    }
    world.doors.push({ b, mesh: rm });
  }
  return world;
}

function markerMesh() {
  const mb = new MeshBuilder(), r = 0.26, h = 0.4;
  const ring = [[r, 0, 0], [0, 0, r], [-r, 0, 0], [0, 0, -r]];
  for (let k = 0; k < 4; k++) {
    const a = ring[k], b = ring[(k + 1) % 4];
    mb.poly([a, b, [0, h, 0]], C.teal, 2, [0, 0, 0]);
    mb.poly([b, a, [0, -h, 0]], shade(C.teal, 0.8), 2, [0, 0, 0]);
  }
  return mb;
}
function ballMesh() {
  return new MeshBuilder().sphere(BALL_R, 28, 18, (n) => (Math.abs(n[1]) < 0.2 || Math.abs(n[0]) < 0.13 ? C.ballB : C.ballA), 4);
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'), bg: $('bg'), gl: $('gl'), hud: $('hud'), controls: $('controls'), title: $('title'), done: $('done'),
  toast: $('toast'), hint: $('hint'), chips: $('chips'), time: $('time'), lvlNum: $('lvlNum'), lvlName: $('lvlName'),
  levels: $('levels'), nogl: $('nogl'),
};

// ---------- sound (synthesised, starts after the first tap) ----------
const audio = {
  ctx: null, lastBump: 0,
  init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } },
  tone(freq, dur, type = 'sine', gain = 0.12, when = 0) {
    if (!this.ctx || save.muted) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  },
  chime() { this.tone(784, 0.5, 'sine', 0.12); this.tone(1175, 0.7, 'sine', 0.09, 0.09); },
  fanfare() { [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.55, 'triangle', 0.08, k * 0.11)); },
  bump(v) {
    if (!this.ctx || save.muted) return;
    const now = performance.now(); if (now - this.lastBump < 70) return; this.lastBump = now;
    this.tone(150 + Math.random() * 40, 0.06, 'triangle', Math.min(0.14, v * 0.025));
  },
  splash() {
    if (!this.ctx || save.muted) return;
    const c = this.ctx, len = Math.floor(c.sampleRate * 0.45), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; fl.type = 'lowpass'; fl.frequency.setValueAtTime(2400, c.currentTime); fl.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.4);
    g.gain.value = 0.22; s.connect(fl).connect(g).connect(c.destination); s.start();
  },
};
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not allowed here */ } };

// ---------- state ----------
let R = null, world = null, gpu = null, game = null, level = null, levelIndex = 0;
let Q = q.ident(), Q0 = q.ident(), anim = null, screen = 'title';
let ballQ = q.ident(), visOff = [0, 0, 0], lastBallPos = null, respawnT = 1;
let camShift = 0.36, camZoom = 1.18, camEl = 0.6, demo = false, autopilot = null, timeScale = 1;
let toastTimer = 0, completeTimer = -1, idleSpin = 0, sharedMeshes = null;
const keys = new Set();

function startLevel(k, toScreen = 'play') {
  levelIndex = k;
  level = parseLevel(LEVELS[k]);
  game = new Game(level);
  if (gpu) { R.free(gpu.world); gpu.buildings.forEach((x) => R.free(x)); gpu.doors.forEach((x) => R.free(x)); }
  world = buildWorld(level, 1000 + k * 77);
  gpu = { world: R.upload(world.mesh), buildings: world.buildings.map((e) => R.upload(e.mesh)), doors: world.doors.map((d) => R.upload(d.mesh)) };
  const sn = FACES[level.start.f].n;
  Q0 = q.mul(q.axis([1, 0, 0], 0.0), q.fromTo(sn, [0, 1, 0]));
  Q = Q0.slice(); anim = null; ballQ = q.ident(); visOff = [0, 0, 0]; lastBallPos = null; respawnT = 1;
  autopilot = makeAutopilot(game, { speed: 2.0 });
  completeTimer = -1; toastTimer = 0; els.toast.hidden = true;
  setScreen(toScreen);
  renderHud();
}

function setScreen(s) {
  screen = s;
  els.title.hidden = s !== 'title';
  els.done.hidden = s !== 'done';
  els.hud.hidden = s !== 'play';
  els.controls.hidden = s !== 'play';
  els.hint.hidden = !(s === 'play' && game && game.phase === 'ready' && !demo);
  if (s !== 'play') { els.toast.hidden = true; toastTimer = 0; }
  if (s === 'title') renderTitle();
  if (s === 'play') { requestWake(); placeToast(); }
}

let wakeLock = null;
async function requestWake() { try { if (!wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { wakeLock = null; } }

// ---------- HUD / screens ----------
const fmtTime = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
const levelName = (k) => LEVELS[k].name[lang];
const isUnlocked = (k) => k === 0 || !!save.done[LEVELS[k - 1].key];

function renderHud() {
  els.lvlNum.textContent = String(levelIndex + 1);
  els.lvlName.textContent = levelName(levelIndex);
  els.chips.innerHTML = '';
  for (const b of level.buildings) {
    const li = document.createElement('li');
    li.className = 'chip' + (game.visited.has(b.letter) ? ' is-done' : '');
    li.innerHTML = `<span class="chip-dot" aria-hidden="true"></span><span></span>`;
    li.lastChild.textContent = b.name[lang];
    els.chips.appendChild(li);
  }
  els.time.textContent = fmtTime(game.time);
  $('btnSpinL').setAttribute('aria-label', t('spinL'));
  $('btnSpinR').setAttribute('aria-label', t('spinR'));
  $('btnFlat').textContent = t('flat'); $('btnFlat').setAttribute('aria-label', t('flatLabel'));
  $('btnRestart').setAttribute('aria-label', t('restart'));
  $('btnMenu').setAttribute('aria-label', t('menu'));
  updateSoundBtn();
  $('hintText').textContent = t('hint');
  $('hintGoal').textContent = t('goal');
  if (screen === 'play') placeToast();
}
function placeToast() {
  requestAnimationFrame(() => { const r = els.hud.getBoundingClientRect(); if (r.height) els.stage.style.setProperty('--hud-bottom', `${Math.round(r.bottom + 10)}px`); });
}
function updateSoundBtn() {
  const b = $('btnSound');
  b.setAttribute('aria-label', save.muted ? t('soundOff') : t('soundOn'));
  b.classList.toggle('is-muted', !!save.muted);
}
const starRow = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function renderTitle() {
  $('tagline').textContent = t('tagline');
  updateLoadNote();
  $('keys').textContent = t('keys');
  document.documentElement.lang = lang === 'me' ? 'sr-Latn-ME' : 'en';
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  els.levels.innerHTML = '';
  LEVELS.forEach((L, k) => {
    const rec = save.done[L.key], open = isUnlocked(k);
    const btn = document.createElement('button');
    btn.className = 'tablet' + (k === levelIndex ? ' is-current' : '') + (open ? '' : ' is-locked');
    btn.disabled = !open;
    btn.innerHTML = `<span class="tablet-num"></span><span class="tablet-name"></span><span class="tablet-meta"></span>`;
    btn.children[0].textContent = String(k + 1);
    btn.children[1].textContent = L.name[lang];
    btn.children[2].textContent = !open ? t('locked') : rec ? `${starRow(rec.stars)} · ${rec.best.toFixed(1)} s` : starRow(0);
    btn.setAttribute('aria-label', `${t('level')} ${k + 1}: ${L.name[lang]}. ${btn.children[2].textContent}`);
    btn.addEventListener('click', () => { levelIndex = k; startLevel(k, 'title'); });
    els.levels.appendChild(btn);
  });
  $('btnPlay').textContent = `${t('play')} · ${t('level')} ${levelIndex + 1}`;
}

function showToast(name, meta, text, ms = 3200) {
  $('toastName').textContent = name; $('toastMeta').textContent = meta; $('toastText').textContent = text || '';
  $('toastText').hidden = !text;
  els.toast.hidden = false;
  els.toast.classList.remove('is-in'); void els.toast.offsetWidth; els.toast.classList.add('is-in');
  toastTimer = ms / 1000;
}

function showDone(time) {
  const L = LEVELS[levelIndex], par = PARS[L.key], s = stars(time, par);
  const prev = save.done[L.key];
  const isBest = !prev || time < prev.best;
  save.done[L.key] = { best: isBest ? time : prev.best, stars: Math.max(s, prev ? prev.stars : 0) };
  writeSave();
  $('doneLevel').textContent = `${t('level')} ${levelIndex + 1} · ${L.name[lang]}`;
  $('doneTitle').textContent = t('complete');
  $('doneStars').textContent = starRow(s);
  $('doneStars').setAttribute('aria-label', `${s} / 3`);
  $('doneTimeLabel').textContent = t('time'); $('doneBestLabel').textContent = t('best');
  $('doneTime').textContent = `${time.toFixed(1)} s`;
  $('doneBest').textContent = `${save.done[L.key].best.toFixed(1)} s`;
  $('doneNew').hidden = !(isBest && prev);
  $('doneNew').textContent = t('newBest');
  $('donePar').textContent = t('par').replace('{par}', String(par));
  const last = levelIndex === LEVELS.length - 1;
  $('btnNext').hidden = last;
  $('doneAll').hidden = !last; $('doneAll').textContent = t('allDone');
  $('btnNext').textContent = t('next'); $('btnAgain').textContent = t('again'); $('btnLevels').textContent = t('levels');
  setScreen('done');
  (last ? $('btnAgain') : $('btnNext')).focus({ preventScroll: true });
}

// ---------- events from the game ----------
function handleEvents(ev) {
  for (const e of ev) {
    if (e.type === 'visit') {
      audio.chime(); buzz(25);
      showToast(e.building.name[lang], `${t('visited')} ${e.count}/${e.total}`, t('stub'));
      renderHud();
    } else if (e.type === 'complete') {
      audio.fanfare(); buzz([30, 60, 30]);
      completeTimer = 1.1;
    } else if (e.type === 'sink') {
      audio.splash(); buzz(70);
      showToast(t('splash'), '', '', 1600);
    } else if (e.type === 'respawn') {
      respawnT = 0; lastBallPos = null;
    } else if (e.type === 'bump') {
      audio.bump(e.speed);
      if (e.speed > 3) buzz(12);
    }
  }
}

// ---------- input ----------
const K_DRAG = 0.0062;
function tiltBy(dx, dy) {
  Q = q.norm(q.mul(q.axis([1, 0, 0], dy * K_DRAG), Q));
  Q = q.norm(q.mul(q.axis([0, 0, 1], -dx * K_DRAG), Q));
  anim = null;
  if (screen === 'play' && game.phase === 'ready' && !demo) { game.begin(); els.hint.hidden = true; }
}
function animateTo(target, dur = 0.34) { anim = { from: Q.slice(), to: target, t: 0, dur }; if (screen === 'play' && game.phase === 'ready') { game.begin(); els.hint.hidden = true; } }
function spin(dir) { animateTo(q.mul(q.axis([0, 1, 0], dir * Math.PI / 2), anim ? anim.to : Q)); }
function levelBallFace() {
  const nW = q.rot(Q, FACES[game.ball.f].n);
  animateTo(q.norm(q.mul(q.fromTo(nW, [0, 1, 0]), Q)), 0.3);
}

let dragId = null, lx = 0, ly = 0;
els.gl.addEventListener('pointerdown', (e) => {
  if (screen !== 'play' || dragId !== null) return;
  dragId = e.pointerId; lx = e.clientX; ly = e.clientY;
  try { els.gl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  audio.init();
});
els.gl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== dragId) return;
  const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
  if (dx || dy) tiltBy(dx, dy);
});
const endDrag = (e) => { if (e.pointerId === dragId) dragId = null; };
els.gl.addEventListener('pointerup', endDrag);
els.gl.addEventListener('pointercancel', endDrag);
window.addEventListener('keydown', (e) => {
  if (screen !== 'play') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { keys.add(e.key); e.preventDefault(); }
  else if (e.key === 'q' || e.key === 'Q') spin(1);
  else if (e.key === 'e' || e.key === 'E') spin(-1);
  else if (e.key === ' ') { levelBallFace(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key));
window.addEventListener('blur', () => keys.clear());

$('btnSpinL').addEventListener('click', () => spin(1));
$('btnSpinR').addEventListener('click', () => spin(-1));
$('btnFlat').addEventListener('click', levelBallFace);
$('btnRestart').addEventListener('click', () => startLevel(levelIndex, 'play'));
$('btnMenu').addEventListener('click', () => setScreen('title'));
$('btnSound').addEventListener('click', () => { audio.init(); save.muted = !save.muted; writeSave(); updateSoundBtn(); });
$('btnPlay').addEventListener('click', () => { audio.init(); startLevel(levelIndex, 'play'); });
$('btnNext').addEventListener('click', () => { startLevel(Math.min(levelIndex + 1, LEVELS.length - 1), 'play'); });
$('btnAgain').addEventListener('click', () => startLevel(levelIndex, 'play'));
$('btnLevels').addEventListener('click', () => { setScreen('title'); });
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  lang = b.dataset.lang; save.lang = lang; writeSave(); renderTitle(); renderHud();
}));

// ---------- backdrop: Prokletije ridges ----------
function drawBackdrop() {
  const c = els.bg, dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#9dbcd4'); sky.addColorStop(0.55, '#cfdde5'); sky.addColorStop(1, '#e6ece6');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const rnd = mulberry(7);
  const layers = [
    { y: 0.6, amp: 0.2, col: '#bccbd6', snow: true, jag: 1 },
    { y: 0.68, amp: 0.13, col: '#9fb3c1', jag: 0.8 },
    { y: 0.79, amp: 0.08, col: '#7d988f', jag: 0.5 },
    { y: 0.88, amp: 0.05, col: '#5d7f6e', jag: 0.3 },
  ];
  for (const L of layers) {
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6], pts = [];
    const steps = 140;
    for (let s = 0; s <= steps; s++) {
      const x = s / steps;
      let y = Math.sin(x * 2.3 + ph[0]) * 0.35 + Math.sin(x * 5.9 + ph[1]) * 0.2;
      y += Math.pow(1 - Math.abs(Math.sin(x * 9.4 + ph[2])), 2.2) * 0.75 * L.jag;
      y += Math.pow(1 - Math.abs(Math.sin(x * 23.7 + ph[3])), 3) * 0.22 * L.jag + Math.sin(x * 61 + ph[0]) * 0.03 * L.jag;
      pts.push([x * w, (L.y - y * L.amp) * h]);
    }
    g.beginPath(); g.moveTo(0, h); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(w, h); g.closePath();
    g.fillStyle = L.col; g.fill();
    if (L.snow) {
      g.save(); g.clip();
      const top = Math.min(...pts.map((p) => p[1]));
      const sg = g.createLinearGradient(0, top, 0, top + h * 0.09);
      sg.addColorStop(0, 'rgba(255,255,255,0.75)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg; g.fillRect(0, top, w, h * 0.1); g.restore();
    }
  }
}

// ---------- render loop ----------
let vpW = 0, vpH = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  vpW = Math.max(1, Math.round(els.gl.clientWidth * dpr)); vpH = Math.max(1, Math.round(els.gl.clientHeight * dpr));
  els.gl.width = vpW; els.gl.height = vpH;
  drawBackdrop();
}

function camera() {
  const aspect = vpW / vpH, fovy = aspect < 1 ? 46 * Math.PI / 180 : 38 * Math.PI / 180;
  const fovx = 2 * Math.atan(Math.tan(fovy / 2) * aspect);
  const half = Math.min(fovy, fovx) / 2;
  const dist = (8.4 / Math.sin(half)) * camZoom, el = camEl;
  const eye = [0, Math.sin(el) * dist, Math.cos(el) * dist];
  const P = m4.perspective(fovy, aspect, 1, dist * 3);
  const shift = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, camShift, 0, 1]);
  return { eye, vp: m4.mul(shift, m4.mul(P, m4.lookAt(eye, [0, 0, 0], [0, 1, 0]))) };
}

let last = performance.now(), clock = 0;
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = real * timeScale;
  clock += real;

  // camera framing per screen
  const play = screen === 'play';
  const wantShift = play ? -0.07 : 0.34, wantZoom = play ? 0.97 : 1.2, wantEl = (play ? 47 : 34) * Math.PI / 180;
  const k = 1 - Math.exp(-real * 5);
  camShift += (wantShift - camShift) * k; camZoom += (wantZoom - camZoom) * k; camEl += (wantEl - camEl) * k;

  // cube orientation
  if (anim) {
    anim.t += real / anim.dur;
    const e = anim.t >= 1 ? 1 : 1 - Math.pow(1 - anim.t, 3);
    Q = q.norm(q.slerp(anim.from, anim.to, e));
    if (anim.t >= 1) anim = null;
  }
  if (screen === 'play' && keys.size) {
    const s = 220 * real;
    tiltBy((keys.has('ArrowRight') ? s : 0) - (keys.has('ArrowLeft') ? s : 0), (keys.has('ArrowDown') ? s : 0) - (keys.has('ArrowUp') ? s : 0));
  }
  if (screen !== 'play') { idleSpin = real * 0.25; Q = q.norm(q.mul(q.axis([0, 1, 0], idleSpin), Q)); }

  // physics (in steps of at most 1/60 s)
  let remaining = screen === 'play' ? dt : 0;
  while (remaining > 1e-6) {
    const h = Math.min(remaining, 1 / 60); remaining -= h;
    if (demo && game.phase !== 'done') {
      game.begin(); els.hint.hidden = true;
      const gTarget = autopilot(h);
      const gw = q.rot(Q, gTarget);
      const turn = q.fromTo(gw, [0, -1, 0]);
      Q = q.norm(q.mul(q.slerp(q.ident(), turn, Math.min(1, h * 9)), Q));
    }
    const gL = q.rot(q.conj(Q), [0, -1, 0]);
    const prevF = game.ball.f;
    const before = facePoint(game.ball.f, game.ball.u, game.ball.v, BALL_R);
    const ev = game.update(h, gL);
    if (game.ball.f !== prevF && game.phase === 'play') {
      const after = facePoint(game.ball.f, game.ball.u, game.ball.v, BALL_R);
      visOff = v3.add(visOff, v3.sub(before, after));
    }
    // rolling
    const b = game.ball, F = FACES[b.f];
    const vel = v3.add(v3.scale(F.u, b.vu), v3.scale(F.v, b.vv)), sp = v3.len(vel);
    if (sp > 1e-4 && game.phase === 'play') ballQ = q.norm(q.mul(q.axis(v3.norm(v3.cross(F.n, vel)), sp * h / BALL_R), ballQ));
    handleEvents(ev);
  }
  visOff = v3.scale(visOff, Math.exp(-real * 22));
  if (respawnT < 1) respawnT = Math.min(1, respawnT + real / 0.28);
  if (completeTimer > 0) { completeTimer -= real; if (completeTimer <= 0) showDone(game.time); }
  if (toastTimer > 0) { toastTimer -= real; if (toastTimer <= 0) els.toast.hidden = true; }
  if (screen === 'play') els.time.textContent = fmtTime(game.time);

  draw();
  requestAnimationFrame(frame);
}

function draw() {
  const { eye, vp } = camera();
  const sun = v3.norm([-0.45, 0.82, 0.38]);
  R.begin(vpW, vpH, vp, eye, sun, clock);
  const cube = m4.fromQ(Q);
  R.draw(gpu.world, cube);
  world.buildings.forEach((e, i) => {
    const done = game.visited.has(e.b.letter);
    const tint = done ? [1.0, 0.86, 0.5, 0.1] : [0, 0, 0, 0];
    const sc = SCANS[e.b.id];
    if (sc && sc.ready) {
      const s = fitScale(sc.size, e.W, e.D), f = e.frame;
      e.height = sc.size[1] * s;
      R.draw(sc.mesh, m4.mul(cube, m4.basis(f.X, f.Y, f.Z, v3.sub(f.o, v3.scale(f.Y, 0.03)), s)), { tex: sc.tex, tint });
    } else {
      e.height = e.placeholderH;
      R.draw(gpu.buildings[i], cube, { tint });
    }
  });
  const pulse = 0.35 + 0.25 * Math.sin(clock * 4);
  world.doors.forEach((d, i) => {
    const done = game.visited.has(d.b.letter);
    R.draw(gpu.doors[i], cube, { tint: done ? GOLD : TEAL, glow: done ? 0.25 : pulse });
  });

  // ball
  const b = game.ball, F = FACES[b.f];
  let sink = 0, scale = 1;
  if (game.phase === 'sink') sink = Math.min(1, game.sinkT / 0.5);
  if (respawnT < 1) scale = 0.4 + 0.6 * (1 - Math.pow(1 - respawnT, 3));
  const pos = v3.add(v3.add(facePoint(b.f, b.u, b.v, BALL_R - sink * 0.62), visOff), [0, 0, 0]);
  const ballM = m4.mul(cube, m4.fromQ(ballQ, pos, scale));
  if (game.phase !== 'sink' || sink < 1) R.draw(sharedMeshes.ball, ballM);

  // markers above unvisited buildings
  world.buildings.forEach((e) => {
    if (game.visited.has(e.b.letter)) return;
    const bob = Math.sin(clock * 2.2 + e.b.letter.charCodeAt(0)) * 0.12;
    const p = v3.add(e.frame.o, v3.scale(e.frame.Y, e.height + 0.7 + bob));
    const m = m4.mul(cube, m4.mul(m4.basis(e.frame.X, e.frame.Y, e.frame.Z, p), m4.fromQ(q.axis([0, 1, 0], clock * 1.4))));
    R.draw(sharedMeshes.marker, m, { tint: TEAL, glow: 0.35 });
  });

  // soft contact shadow
  if (game.phase !== 'sink') {
    const sp = facePoint(b.f, b.u, b.v, 0.012), Z = v3.cross(F.u, F.n);
    R.draw(sharedMeshes.blob, m4.mul(cube, m4.basis(F.u, F.n, Z, v3.add(sp, visOff))), { depthWrite: false, alpha: scale });
  }
  // ghost ball when its face points away from the camera
  const nW = q.rot(Q, F.n), pW = q.rot(Q, pos), toCam = v3.norm(v3.sub(eye, pW));
  if (v3.dot(nW, toCam) < 0.08 && game.phase !== 'sink') R.draw(sharedMeshes.ball, ballM, { alpha: 0.4, depthTest: false, depthWrite: false, tint: [0.06, 0.55, 0.55, 0.35] });
}

// ---------- boot ----------
function boot(data = {}) {
  try { R = new Renderer(els.gl); } catch (err) {
    els.nogl.hidden = false; els.nogl.textContent = t('noGL'); els.title.hidden = true; return;
  }
  sharedMeshes = { ball: R.upload(ballMesh()), marker: R.upload(markerMesh()), blob: R.upload(new MeshBuilder().blob(0.44, 0.34)) };
  loadAllScans();
  resize();
  window.addEventListener('resize', resize);
  demo = location.hash === '#demo';
  const first = Number.isInteger(data.level) ? data.level : LEVELS.findIndex((L, k) => isUnlocked(k) && !save.done[L.key]);
  startLevel(Math.max(0, first === -1 ? 0 : first), demo ? 'play' : 'title');
  requestAnimationFrame((ts) => { last = ts; frame(ts); });
  try { window.claude?.hot?.snapshot?.(() => ({ level: levelIndex })); } catch { /* optional host hook */ }
}
window.__gk = {
  get game() { return game; }, get screen() { return screen; }, get Q() { return Q; },
  startLevel, setDemo(v) { demo = v; }, setTimeScale(v) { timeScale = v; },
  tilt: tiltBy,
};
if (window.claude?.hot?.ready) window.claude.hot.ready(boot); else boot(window.claude?.hot?.data ?? {});
