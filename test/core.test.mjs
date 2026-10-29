import * as C from '../src/core.js';

let fail = 0;
const ok = (cond, msg) => { if (!cond) { fail++; console.log('FAIL', msg); } };

// 1. fold() round trips and edge adjacency is symmetric
for (let f = 0; f < 6; f++) for (let t = -C.H + 0.25; t < C.H; t += 0.5) {
  for (const [u, v] of [[C.H + 0.1, t], [-C.H - 0.1, t], [t, C.H + 0.1], [t, -C.H - 0.1]]) {
    const r = C.fold(f, u, v, 0, 0);
    const p1 = C.facePoint(f, Math.max(-C.H, Math.min(C.H, u)), Math.max(-C.H, Math.min(C.H, v)));
    const p2 = C.facePoint(r.f, r.u, r.v);
    const expect = C.v3.sub(p1, C.v3.scale(C.FACES[f].n, 0.1));
    ok(C.v3.len(C.v3.sub(expect, p2)) < 1e-9, `folded point mismatch f=${f} u=${u} v=${v}`);
    ok(Math.abs(r.u) <= C.H && Math.abs(r.v) <= C.H, `fold lands inside f=${f}`);
    // fold back: step the folded point back over the same edge
    const F2 = C.FACES[r.f];
    const n1 = C.FACES[f].n;
    const back = C.fold(r.f, r.u + 0.2 * C.v3.dot(n1, F2.u), r.v + 0.2 * C.v3.dot(n1, F2.v));
    ok(back.f === f, `fold back to original face f=${f}`);
  }
}

// 2. Levels parse cleanly and every door is reachable from the start
const pars = {};
for (const def of C.LEVELS) {
  const L = C.parseLevel(def);
  ok(L.errors.length === 0, `${def.key} errors: ${L.errors.join('; ')}`);
  if (L.warnings.length) console.log('warn', L.warnings.join('\n     '));
  console.log(`${def.key}: ${L.buildings.length} buildings, gates:`, L.gates.map((g) => `${C.FACES[g.a[0]].name}(${g.a[2]},${g.a[1]})↔${C.FACES[g.b[0]].name}(${g.b[2]},${g.b[1]})`).join('  '));
  const s = [L.start.f, L.start.i, L.start.j];
  for (const b of L.buildings) {
    const p = C.bfs(L, s, ([f, i, j]) => f === b.door.f && i === b.door.i && j === b.door.j);
    ok(!!p, `${def.key}: door of ${b.letter} reachable`);
  }

  // 3. Autopilot completes the level
  for (const speed of [1.6, 2.2]) {
    const g = new C.Game(L); g.begin();
    const ap = C.makeAutopilot(g, { speed });
    const dt = 1 / 60; let t = 0, crosses = 0, sinks = 0, done = false;
    while (t < 240) {
      const ev = g.update(dt, ap(dt)); t += dt;
      for (const e of ev) { if (e.type === 'cross') crosses++; if (e.type === 'sink') sinks++; if (e.type === 'complete') done = true; }
      if (done) break;
    }
    ok(done, `${def.key}: autopilot (speed ${speed}) completes — visited ${g.visited.size}/${g.total} at t=${t.toFixed(1)} ball f=${g.ball.f} u=${g.ball.u.toFixed(2)} v=${g.ball.v.toFixed(2)}`);
    console.log(`  autopilot speed ${speed}: ${done ? 'done' : 'NOT done'} in ${g.time.toFixed(1)} s, ${crosses} edge crossings, ${sinks} splashes`);
    if (speed === 2.2 && done) pars[def.key] = g.time;
  }

  // 4. Fuzz: random smooth gravity, check invariants
  let rng = 12345; const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const g = new C.Game(L); g.begin();
  let dir = [0, -1, 0], target = [0, -1, 0], crosses = 0, sinks = 0, bad = 0;
  for (let step = 0; step < 60 * 400; step++) {
    if (step % 90 === 0) target = C.v3.norm([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);
    dir = C.v3.norm(C.v3.add(C.v3.scale(dir, 0.97), C.v3.scale(target, 0.03)));
    const ev = g.update(1 / 60, dir);
    for (const e of ev) { if (e.type === 'cross') crosses++; if (e.type === 'sink') sinks++; if (e.type === 'complete') { g.reset(); g.begin(); } }
    const b = g.ball;
    if (!(Math.abs(b.u) <= C.H + 1e-6 && Math.abs(b.v) <= C.H + 1e-6) || !Number.isFinite(b.u + b.v + b.vu + b.vv)) bad++;
    const c = L.at(b.f, C.tileI(b.u), C.tileJ(b.v));
    if (C.isSolidChar(c)) bad++;
  }
  ok(bad === 0, `${def.key}: fuzz invariants (${bad} bad frames)`);
  console.log(`  fuzz 400 s: ${crosses} crossings, ${sinks} splashes, ${bad} bad frames`);
}
console.log('pars', JSON.stringify(Object.fromEntries(Object.entries(pars).map(([k, v]) => [k, Math.round(v * 10) / 10]))));
console.log(fail ? `${fail} FAILURES` : 'ALL OK');
process.exit(fail ? 1 : 0);
