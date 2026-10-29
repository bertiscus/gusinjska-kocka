// ===== Gusinjska kocka — game core (no rendering, no DOM) =====
// The cube has six faces, each a 9×9 grid of tiles (1 tile = 1 unit).
// The ball is "magnetic": it always stays on the surface and is pushed by
// the part of real-world gravity that lies along the face it is on.

export const N = 9;
export const H = N / 2;
export const BALL_R = 0.33;
export const TREE_R = 0.26;
export const PHYS = { G: 15, ROLL: 0.9, DAMP: 0.35, VMAX: 6.5, BOUNCE: 0.3, SUB: 4 };

// Face frames. For each face: n = outward normal, u/v = in-plane axes (u × v = n).
// Map strings: row 0 is the +v side, column 0 is the -u side.
export const FACES = [
  { name: 'top',    n: [0, 1, 0],  u: [1, 0, 0],  v: [0, 0, -1] },
  { name: 'front',  n: [0, 0, 1],  u: [1, 0, 0],  v: [0, 1, 0] },
  { name: 'bottom', n: [0, -1, 0], u: [1, 0, 0],  v: [0, 0, 1] },
  { name: 'back',   n: [0, 0, -1], u: [1, 0, 0],  v: [0, -1, 0] },
  { name: 'left',   n: [-1, 0, 0], u: [0, 0, 1],  v: [0, 1, 0] },
  { name: 'right',  n: [1, 0, 0],  u: [0, 0, -1], v: [0, 1, 0] },
];
export const FACE_INDEX = Object.fromEntries(FACES.map((f, k) => [f.name, k]));

export const v3 = {
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

export function facePoint(f, u, v, h = 0) {
  const F = FACES[f], d = H + h;
  return [d * F.n[0] + u * F.u[0] + v * F.v[0], d * F.n[1] + u * F.u[1] + v * F.v[1], d * F.n[2] + u * F.u[2] + v * F.v[2]];
}
export const tileU = (i) => -H + i + 0.5;
export const tileV = (j) => H - j - 0.5;
export const tileI = (u) => Math.floor(u + H);
export const tileJ = (v) => Math.floor(H - v);

export function faceWithNormal(d) {
  for (let k = 0; k < 6; k++) if (v3.dot(FACES[k].n, d) > 0.5) return k;
  return -1;
}

// Fold a point (and optionally a velocity) that has gone past one edge of face f
// onto the neighbouring face. Returns null in the corner region (past two edges).
export function fold(f, u, v, vu = 0, vv = 0) {
  const F = FACES[f];
  let d, delta;
  const ou = Math.abs(u) > H, ov = Math.abs(v) > H;
  if (ou && ov) return null;
  if (ou) { d = u > 0 ? F.u : v3.scale(F.u, -1); delta = Math.abs(u) - H; }
  else if (ov) { d = v > 0 ? F.v : v3.scale(F.v, -1); delta = Math.abs(v) - H; }
  else return { f, u, v, vu, vv };
  const p = facePoint(f, u, v);
  const e = v3.sub(p, v3.scale(d, delta));
  const q = v3.sub(e, v3.scale(F.n, delta));
  const g = faceWithNormal(d), G = FACES[g];
  const vel = v3.add(v3.scale(F.u, vu), v3.scale(F.v, vv));
  const vd = v3.dot(vel, d);
  const vel2 = v3.sub(v3.sub(vel, v3.scale(d, vd)), v3.scale(F.n, vd));
  return { f: g, u: v3.dot(q, G.u), v: v3.dot(q, G.v), vu: v3.dot(vel2, G.u), vv: v3.dot(vel2, G.v) };
}

// ---------- Content ----------
// Building letters (footprint, solid) and their lower-case door tiles.
// Building letters in the level maps. `id` is the model file in models/<id>.bin + .jpg.
export const BUILDINGS = {
  K: { id: 'kula-rasica', name: { me: 'Kula Rašića', en: 'Rašić Tower' } },
  J: { id: 'sebilj', name: { me: 'Sebilj', en: 'Sebilj fountain' } },
  N: { id: 'kula-nekovica', name: { me: 'Kula Nekovića', en: 'Neković Tower' } },
  S: { id: 'sahat-kula', name: { me: 'Sahat kula', en: 'Clock Tower' } },
  O: { id: 'opstina', name: { me: 'Opština Gusinje', en: 'Gusinje Municipality' } },
  C: { id: 'cekica-dzamija', name: { me: 'Čekića džamija', en: 'Čekić Mosque' } },
  V: { id: 'vezirova-dzamija', name: { me: 'Vezirova džamija', en: 'Vizier’s Mosque' } },
};
export const isBuildingChar = (c) => !!BUILDINGS[c];
export const isDoorChar = (c) => !!BUILDINGS[c.toUpperCase()] && c !== c.toUpperCase();
export const isSolidChar = (c) => c === '#' || isBuildingChar(c);
export const isPassableChar = (c) => c === '.' || c === '@' || isDoorChar(c);

// Closed, decorative faces for parts of the cube a level doesn't use.
const DECOR = [
  ['#########', '#.T...T.#', '#...T...#', '#.T...T.#', '#...T...#', '#.T...T.#', '#...T...#', '#.T...T.#', '#########'],
  ['#########', '#T..T..T#', '#.......#', '#..T.T..#', '#T.....T#', '#..T.T..#', '#.......#', '#T..T..T#', '#########'],
  ['#########', '#.......#', '#.T.T.T.#', '#.......#', '#.T.~.T.#', '#.......#', '#.T.T.T.#', '#.......#', '#########'],
];

export const LEVELS = [
  {
    key: 'kula', name: { me: 'Kula', en: 'The Tower' },
    faces: {
      top: [
        '#########',
        '#@......#',
        '#.#####.#',
        '#.......#',
        '#..KKK..#',
        '#..KKK..#',
        '#..KKK..#',
        '#T..k..T#',
        '####.####',
      ],
      front: [
        '####.####',
        '#T.....T#',
        '#.##.##.#',
        '#.......#',
        '#.#####.#',
        '#...JJ..#',
        '#...JJ..#',
        '#T..j..T#',
        '#########',
      ],
    },
  },
  {
    key: 'izvori', name: { me: 'Izvori', en: 'The Springs' },
    faces: {
      top: [
        '#########',
        '#@..~~..#',
        '#.#.~~.T#',
        '#.#.....#',
        '#...SS...',
        '#~~.SS.T#',
        '#~~..s..#',
        '#T.....~#',
        '#########',
      ],
      right: [
        '####.####',
        '#T.....T#',
        '#.NNN...#',
        '#.NNN.#.#',
        '#.NNN.#.#',
        '#..n..#.#',
        '#.#####.#',
        '........#',
        '#########',
      ],
      front: [
        '#########',
        '#.......#',
        '#.OOO.~~#',
        '#.OOO.~~#',
        '#..o....#',
        '#~~~.##.#',
        '#.......#',
        '#T.......',
        '#########',
      ],
    },
  },
  {
    key: 'kocka', name: { me: 'Cijela kocka', en: 'Round the Cube' },
    faces: {
      left: [
        '####.####',
        '#T.....T#',
        '#..###..#',
        '#.......#',
        '#.T.T.T.#',
        '#.......#',
        '#T..@..T#',
        '#.......#',
        '#########',
      ],
      top: [
        '#########',
        '#.......#',
        '#.##.##.#',
        '#..JJ...#',
        '...JJ.#.#',
        '#T.j..#.#',
        '#..#..#..',
        '#T.#....#',
        '#########',
      ],
      right: [
        '##.######',
        '#..T....#',
        '#.#.VVV.#',
        '#.#.VVV.#',
        '#.#.VVV.#',
        '#.#..v..#',
        '..####..#',
        '#.......#',
        '#########',
      ],
      front: [
        '#########',
        '#~~...~~#',
        '#~..~...#',
        '#..~~~..#',
        '#.~...~.#',
        '#...~...#',
        '#.~~~....',
        '#...~~~.#',
        '##.######',
      ],
      bottom: [
        '##.######',
        '#.......#',
        '#.~~~~~.#',
        '#.~SS~..#',
        '#..SS...#',
        '#.~.s.~.#',
        '#T.....T#',
        '#..~.~..#',
        '######.##',
      ],
      back: [
        '######.##',
        '#.......#',
        '#..CCC..#',
        '#..CCC..#',
        '#T.CCC.T#',
        '#~..c..~#',
        '#~~...~~#',
        '#T..T..T#',
        '#########',
      ],
    },
  },
];

// ---------- Level parsing ----------
export function parseLevel(def) {
  const errors = [], warnings = [];
  let decor = 0;
  const grid = FACES.map((F) => {
    const rows = def.faces[F.name] || DECOR[decor++ % DECOR.length];
    if (rows.length !== N || rows.some((r) => r.length !== N)) errors.push(`${def.key}/${F.name}: map must be ${N}×${N}`);
    return rows.map((r) => r.split(''));
  });
  const at = (f, i, j) => grid[f][j][i];

  // Unfolded 13×13 view of each face: the face plus two rows of each neighbour, laid flat.
  const UW = N + 4;
  const unfolded = FACES.map((F, f) => {
    const chars = new Array(UW * UW).fill('#');
    const src = new Array(UW * UW).fill(null);
    for (let j = -2; j < N + 2; j++) for (let i = -2; i < N + 2; i++) {
      const k = (j + 2) * UW + (i + 2);
      const inI = i >= 0 && i < N, inJ = j >= 0 && j < N;
      if (inI && inJ) { chars[k] = at(f, i, j); src[k] = [f, i, j]; continue; }
      if (!inI && !inJ) continue;
      const r = fold(f, tileU(i), tileV(j));
      const i2 = tileI(r.u), j2 = tileJ(r.v);
      chars[k] = at(r.f, i2, j2); src[k] = [r.f, i2, j2];
    }
    return { chars, src };
  });

  const ufChar = (f, i, j) => (i < -2 || j < -2 || i >= N + 2 || j >= N + 2) ? '#' : unfolded[f].chars[(j + 2) * UW + (i + 2)];
  const ufSrc = (f, i, j) => (i < -2 || j < -2 || i >= N + 2 || j >= N + 2) ? null : unfolded[f].src[(j + 2) * UW + (i + 2)];

  // Start, buildings, doors
  let start = null;
  const buildings = {};
  grid.forEach((rows, f) => rows.forEach((row, j) => row.forEach((c, i) => {
    if (c === '@') { if (start) errors.push(`${def.key}: two starts`); start = { f, i, j }; }
    if (isBuildingChar(c)) {
      const b = buildings[c] || (buildings[c] = { letter: c, ...BUILDINGS[c], f, tiles: [], door: null });
      if (b.f !== f) errors.push(`${def.key}: building ${c} on two faces`);
      b.tiles.push([i, j]);
    }
  })));
  grid.forEach((rows, f) => rows.forEach((row, j) => row.forEach((c, i) => {
    if (isDoorChar(c)) {
      const b = buildings[c.toUpperCase()];
      if (!b) { errors.push(`${def.key}: door ${c} without building`); return; }
      if (b.door) errors.push(`${def.key}: building ${c} has two doors`);
      b.door = { f, i, j };
    }
  })));
  if (!start) errors.push(`${def.key}: no start`);
  for (const b of Object.values(buildings)) {
    if (!b.door) { errors.push(`${def.key}: building ${b.letter} has no door`); continue; }
    const is = b.tiles.map((t) => t[0]), js = b.tiles.map((t) => t[1]);
    b.i0 = Math.min(...is); b.i1 = Math.max(...is); b.j0 = Math.min(...js); b.j1 = Math.max(...js);
    if ((b.i1 - b.i0 + 1) * (b.j1 - b.j0 + 1) !== b.tiles.length) errors.push(`${def.key}: building ${b.letter} is not a rectangle`);
    b.cu = (tileU(b.i0) + tileU(b.i1)) / 2; b.cv = (tileV(b.j0) + tileV(b.j1)) / 2;
    const du = tileU(b.door.i) - b.cu, dv = tileV(b.door.j) - b.cv;
    // Facing: the axis direction pointing at the door
    if (Math.abs(du) > Math.abs(dv)) { b.face = [Math.sign(du), 0]; } else { b.face = [0, Math.sign(dv)]; }
    const adj = b.tiles.some(([i, j]) => Math.abs(i - b.door.i) + Math.abs(j - b.door.j) === 1);
    if (b.door.f !== b.f || !adj) errors.push(`${def.key}: door of ${b.letter} must touch the building`);
  }

  // Corners must be walls on every face (keeps the ball away from cube corners).
  grid.forEach((rows, f) => {
    for (const [i, j] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]])
      if (at(f, i, j) !== '#') errors.push(`${def.key}/${FACES[f].name}: corner ${i},${j} must be #`);
  });

  // Gates: an open border tile should face an open tile on the neighbour.
  const gates = [];
  grid.forEach((rows, f) => rows.forEach((row, j) => row.forEach((c, i) => {
    if (!(i === 0 || j === 0 || i === N - 1 || j === N - 1) || !isPassableChar(c) && c !== '~') return;
    const dirs = [];
    if (i === 0) dirs.push([-1, 0]); if (i === N - 1) dirs.push([1, 0]);
    if (j === 0) dirs.push([0, -1]); if (j === N - 1) dirs.push([0, 1]);
    for (const [di, dj] of dirs) {
      const s = ufSrc(f, i + di, j + dj);
      const c2 = ufChar(f, i + di, j + dj);
      if (isPassableChar(c2) || c2 === '~') { if (f < s[0]) gates.push({ a: [f, i, j], b: s }); }
      else warnings.push(`${def.key}/${FACES[f].name} ${i},${j}: open rim tile faces '${c2}' on ${FACES[s[0]].name} ${s[1]},${s[2]}`);
    }
  })));

  const level = {
    def, key: def.key, name: def.name, grid, at, ufChar, ufSrc, start,
    buildings: Object.values(buildings), gates, errors, warnings,
  };
  level.doorAt = (f, i, j) => level.buildings.find((b) => b.door.f === f && b.door.i === i && b.door.j === j) || null;
  return level;
}

// ---------- Tile graph (for checks and the demo autopilot) ----------
export function neighbours(level, f, i, j) {
  const out = [];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const s = level.ufSrc(f, i + di, j + dj);
    if (!s) continue;
    const c = level.at(s[0], s[1], s[2]);
    if (isPassableChar(c)) out.push(s);
  }
  return out;
}
export function bfs(level, from, isGoal) {
  const key = (t) => t.join(',');
  const prev = new Map([[key(from), null]]);
  const q = [from];
  while (q.length) {
    const t = q.shift();
    if (isGoal(t)) { const path = []; let k = key(t), cur = t; while (cur) { path.push(cur); cur = prev.get(key(cur)); } return path.reverse(); }
    for (const nb of neighbours(level, ...t)) { const k = key(nb); if (!prev.has(k)) { prev.set(k, t); q.push(nb); } }
  }
  return null;
}

// ---------- Ball physics ----------
function collide(level, b) {
  const r = BALL_R, B = PHYS.BOUNCE;
  const ti = tileI(b.u), tj = tileJ(b.v);
  const S = (i, j) => isSolidChar(level.ufChar(b.f, i, j));
  const uMin = ti - H, uMax = uMin + 1, vMax = H - tj, vMin = vMax - 1;
  let hit = 0;
  if (S(ti, tj)) return -1; // inside a solid tile: caller restores
  if (S(ti - 1, tj) && b.u - r < uMin) { b.u = uMin + r; if (b.vu < 0) { hit = Math.max(hit, -b.vu); b.vu = -b.vu * B; } }
  if (S(ti + 1, tj) && b.u + r > uMax) { b.u = uMax - r; if (b.vu > 0) { hit = Math.max(hit, b.vu); b.vu = -b.vu * B; } }
  if (S(ti, tj - 1) && b.v + r > vMax) { b.v = vMax - r; if (b.vv > 0) { hit = Math.max(hit, b.vv); b.vv = -b.vv * B; } }
  if (S(ti, tj + 1) && b.v - r < vMin) { b.v = vMin + r; if (b.vv < 0) { hit = Math.max(hit, -b.vv); b.vv = -b.vv * B; } }
  for (const [di, dj] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if (!S(ti + di, tj + dj) || S(ti + di, tj) || S(ti, tj + dj)) continue;
    const cu = di < 0 ? uMin : uMax, cv = dj < 0 ? vMax : vMin;
    hit = Math.max(hit, pushFromPoint(b, cu, cv, r));
  }
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (level.ufChar(b.f, ti + di, tj + dj) !== 'T') continue;
    hit = Math.max(hit, pushFromPoint(b, tileU(ti + di), tileV(tj + dj), r + TREE_R));
  }
  return hit;
}
function pushFromPoint(b, cu, cv, rr) {
  const du = b.u - cu, dv = b.v - cv, d2 = du * du + dv * dv;
  if (d2 >= rr * rr || d2 < 1e-12) return 0;
  const d = Math.sqrt(d2), nu = du / d, nv = dv / d;
  b.u = cu + nu * rr; b.v = cv + nv * rr;
  const vn = b.vu * nu + b.vv * nv;
  if (vn < 0) { b.vu -= (1 + PHYS.BOUNCE) * vn * nu; b.vv -= (1 + PHYS.BOUNCE) * vn * nv; return -vn; }
  return 0;
}

export function stepBall(level, b, g, dt, events) {
  const F = FACES[b.f];
  let au = PHYS.G * v3.dot(g, F.u), av = PHYS.G * v3.dot(g, F.v);
  const sp = Math.hypot(b.vu, b.vv);
  if (sp > 1e-4) {
    const dec = Math.min(PHYS.ROLL, sp / dt);
    au -= dec * b.vu / sp; av -= dec * b.vv / sp;
  } else {
    const am = Math.hypot(au, av);
    if (am <= PHYS.ROLL) { au = 0; av = 0; } else { au -= PHYS.ROLL * au / am; av -= PHYS.ROLL * av / am; }
  }
  b.vu += au * dt; b.vv += av * dt;
  const damp = Math.exp(-PHYS.DAMP * dt);
  b.vu *= damp; b.vv *= damp;
  const sp2 = Math.hypot(b.vu, b.vv);
  if (sp2 > PHYS.VMAX) { b.vu *= PHYS.VMAX / sp2; b.vv *= PHYS.VMAX / sp2; }
  const pu = b.u, pv = b.v;
  b.u += b.vu * dt; b.v += b.vv * dt;
  const hit = collide(level, b);
  if (hit < 0) { b.u = pu; b.v = pv; b.vu = 0; b.vv = 0; }
  else if (hit > 1.2 && events) events.push({ type: 'bump', speed: hit });
  if (Math.abs(b.u) > H || Math.abs(b.v) > H) {
    const r = fold(b.f, b.u, b.v, b.vu, b.vv);
    if (!r) { b.u = pu; b.v = pv; b.vu = 0; b.vv = 0; return; }
    const from = b.f;
    Object.assign(b, r);
    if (events) events.push({ type: 'cross', from, to: b.f });
  }
}

// ---------- Game state ----------
export class Game {
  constructor(level) { this.level = level; this.reset(); }
  reset() {
    const s = this.level.start;
    this.ball = { f: s.f, u: tileU(s.i), v: tileV(s.j), vu: 0, vv: 0 };
    this.checkpoint = { f: s.f, u: tileU(s.i), v: tileV(s.j) };
    this.visited = new Set();
    this.phase = 'ready';
    this.time = 0; this.sinkT = 0; this.splashes = 0;
  }
  begin() { if (this.phase === 'ready') this.phase = 'play'; }
  get total() { return this.level.buildings.length; }
  update(dt, g) {
    const ev = [];
    if (this.phase === 'play') {
      this.time += dt;
      const n = PHYS.SUB, h = dt / n;
      for (let k = 0; k < n && this.phase === 'play'; k++) {
        stepBall(this.level, this.ball, g, h, ev);
        const b = this.ball, i = tileI(b.u), j = tileJ(b.v);
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const c = this.level.at(b.f, i, j);
        if (c === '~') { this.phase = 'sink'; this.sinkT = 0; this.splashes++; ev.push({ type: 'sink' }); }
        else if (isDoorChar(c)) {
          const bld = this.level.doorAt(b.f, i, j);
          if (bld && !this.visited.has(bld.letter)) {
            this.visited.add(bld.letter);
            this.checkpoint = { f: b.f, u: tileU(i), v: tileV(j) };
            ev.push({ type: 'visit', building: bld, count: this.visited.size, total: this.total });
            if (this.visited.size === this.total) { this.phase = 'done'; ev.push({ type: 'complete', time: this.time }); }
          }
        }
      }
    } else if (this.phase === 'sink') {
      this.time += dt;
      this.sinkT += dt;
      if (this.sinkT > 0.75) {
        const c = this.checkpoint;
        this.ball = { f: c.f, u: c.u, v: c.v, vu: 0, vv: 0 };
        this.phase = 'play';
        ev.push({ type: 'respawn' });
      }
    }
    return ev;
  }
}

// Three-star times (about 1.8× the autopilot's best run).
export const PARS = { kula: 21, izvori: 33, kocka: 84 };

export function stars(time, par) { return time <= par ? 3 : time <= par * 1.6 ? 2 : 1; }

// ---------- Autopilot (demo + automated tests) ----------
// Returns a function (dt) => gravity vector in cube coordinates that steers the ball
// to the nearest unvisited door, the way a careful player would tilt the cube.
export function makeAutopilot(game, opts = {}) {
  const speed = opts.speed ?? 2.0;
  let path = null, k = 0, replanT = 0, lastVisited = -1;
  const plan = () => {
    const b = game.ball, L = game.level;
    const from = [b.f, tileI(b.u), tileJ(b.v)];
    path = bfs(L, from, ([f, i, j]) => { const d = L.doorAt(f, i, j); return d && !game.visited.has(d.letter); });
    k = 1; replanT = 0; lastVisited = game.visited.size;
  };
  return (dt) => {
    const b = game.ball, F = FACES[b.f];
    if (!path || lastVisited !== game.visited.size || (replanT += dt) > 1.5) plan();
    if (!path || game.phase !== 'play') return v3.scale(F.n, -1);
    // Target position of path[k] in the ball's face frame (unfolded if on a neighbour).
    const targetUV = (t) => {
      if (!t) return null;
      if (t[0] === b.f) return [tileU(t[1]), tileV(t[2])];
      const ti = tileI(b.u), tj = tileJ(b.v);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const s = game.level.ufSrc(b.f, ti + di, tj + dj);
        if (s && s[0] === t[0] && s[1] === t[1] && s[2] === t[2]) return [tileU(ti + di), tileV(tj + dj)];
      }
      return null;
    };
    let T = targetUV(path[k]);
    while (T && k < path.length - 1 && Math.hypot(T[0] - b.u, T[1] - b.v) < 0.28) { k++; T = targetUV(path[k]); }
    if (!T) { plan(); T = targetUV(path && path[k]); if (!T) return v3.scale(F.n, -1); }
    let du = T[0] - b.u, dv = T[1] - b.v; const dist = Math.hypot(du, dv) || 1;
    du /= dist; dv /= dist;
    // Slow down before a turn
    const nextT = targetUV(path[k + 1]);
    let vdes = speed;
    if (nextT) {
      const nu = nextT[0] - T[0], nv = nextT[1] - T[1], nl = Math.hypot(nu, nv) || 1;
      const turn = 1 - (du * nu + dv * nv) / nl;
      vdes = speed * Math.max(0.35, 1 - 0.6 * turn * Math.max(0, 1 - dist));
    }
    let au = 7 * (du * vdes - b.vu), av = 7 * (dv * vdes - b.vv);
    // Cancel rolling resistance
    const sp = Math.hypot(b.vu, b.vv);
    if (sp > 1e-3) { au += PHYS.ROLL * b.vu / sp; av += PHYS.ROLL * b.vv / sp; } else { au += PHYS.ROLL * du; av += PHYS.ROLL * dv; }
    let gu = au / PHYS.G, gv = av / PHYS.G; const gl = Math.hypot(gu, gv);
    if (gl > 0.75) { gu *= 0.75 / gl; gv *= 0.75 / gl; }
    const gn = -Math.sqrt(Math.max(0, 1 - gu * gu - gv * gv));
    return v3.add(v3.add(v3.scale(F.u, gu), v3.scale(F.v, gv)), v3.scale(F.n, gn));
  };
}
