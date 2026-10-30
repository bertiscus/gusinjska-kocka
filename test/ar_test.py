"""End-to-end AR test: the game in Chromium with a fake camera fed from test/ar_video.py.

python3 test/ar_test.py VIDEO.y4m [seconds]

Checks: the cube is found, the tracked pose matches ground truth, the game cube lands on the
printed cube on screen, gravity in cube coordinates matches the real tilt, and the ball rolls downhill.
"""
import asyncio, json, math, os, subprocess, sys, time
import numpy as np
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'test', 'shots')
PORT = 8790

PROBE = """() => {
  const g = window.__gk, ar = g.ar, v = g.arView;
  if (!ar) return null;
  const out = { mode: g.mode, active: ar.active, tracking: ar.tracking, markers: ar.markers, fps: ar.fps, cv: ar.cvMs,
    phase: g.game.phase, ball: { ...g.game.ball }, time: g.game.time, gAR: g.gAR, hint: document.getElementById('arHint').hidden ? '' : document.getElementById('arHintTitle').textContent,
    vw: ar.video.videoWidth, vh: ar.video.videoHeight };
  if (ar.pose) out.pose = { R: ar.pose.R, t: ar.pose.t };
  if (v && v.cube && v.K) {
    const W = document.getElementById('gl').width, H = document.getElementById('gl').height;
    const k = 4.5 / 1.02, mm = ar.edge / 2;
    const gl = [], cvp = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const p = [x * k, y * k, z * k];
      const m = v.cube, P = v.vp;
      const w4 = [0, 1, 2, 3].map((i) => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
      const c4 = [0, 1, 2, 3].map((i) => P[i] * w4[0] + P[4 + i] * w4[1] + P[8 + i] * w4[2] + P[12 + i] * w4[3]);
      gl.push([(c4[0] / c4[3] * 0.5 + 0.5) * W, (0.5 - c4[1] / c4[3] * 0.5) * H]);
      const R = ar.pose.R, t = ar.pose.t, X = [x * mm, y * mm, z * mm];
      const xc = R[0] * X[0] + R[1] * X[1] + R[2] * X[2] + t[0], yc = R[3] * X[0] + R[4] * X[1] + R[5] * X[2] + t[1], zc = R[6] * X[0] + R[7] * X[1] + R[8] * X[2] + t[2];
      cvp.push([((v.K.fx * xc / zc + v.K.cx) - v.ox) * v.s, ((v.K.fy * yc / zc + v.K.cy) - v.oy) * v.s]);
    }
    out.align = { gl, cv: cvp, s: v.s, ox: v.ox, oy: v.oy, W, H };
  }
  return out;
}"""


def rot_err(A, B):
    A, B = np.array(A).reshape(3, 3), np.array(B).reshape(3, 3)
    c = (np.trace(A.T @ B) - 1) / 2
    return math.degrees(math.acos(max(-1, min(1, c))))


async def main():
    video = sys.argv[1]; secs = float(sys.argv[2]) if len(sys.argv) > 2 else 26
    gt = json.load(open(video.replace('.y4m', '.json')))
    segs = gt['segments']; K = gt['K']
    os.makedirs(OUT, exist_ok=True)
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={video}',
                                          '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  permissions=['camera'], locale='sr-Latn-ME')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith(f'http://127.0.0.1:{PORT}') else r.abort())
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?fov={gt["fov"]:.4f}&debug')
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=f'{OUT}/ar_00_title.png')
        await pg.click('#btnAR')
        for _ in range(40):
            await pg.wait_for_timeout(250)
            if await pg.evaluate("window.__gk.mode") == 'ar': break
        print('mode after tap:', await pg.evaluate("window.__gk.mode"), '| error box:', await pg.evaluate("document.getElementById('arErr').hidden ? '' : document.getElementById('arErr').textContent"))
        await pg.evaluate(f"window.__gk.ar.upOverride = {json.dumps(gt['up_cam'])}")
        # The test browser may deliver a centre crop of the video file; match the intrinsics to it.
        for _ in range(20):
            vw, vh = await pg.evaluate("[window.__gk.ar.video.videoWidth, window.__gk.ar.video.videoHeight]")
            if vw: break
            await pg.wait_for_timeout(200)
        if (vw, vh) != (gt['W'], gt['H']):
            K = dict(K); K['cx'] -= (gt['W'] - vw) / 2; K['cy'] -= (gt['H'] - vh) / 2
            fov = math.degrees(2 * math.atan(max(vw, vh) / 2 / K['fx']))
            await pg.evaluate(f"window.__gk.ar.fov = {fov}")
            print(f'browser delivers a {vw}x{vh} centre crop of the {gt["W"]}x{gt["H"]} video: field of view set to {fov:.2f}°')
        samples = []; shots = set(); t0 = time.time()
        while time.time() - t0 < secs:
            await pg.wait_for_timeout(300)
            s = await pg.evaluate(PROBE)
            if not s: continue
            s['wall'] = time.time() - t0
            if s.get('pose'):
                errs_r = [rot_err(s['pose']['R'], sg['R']) for sg in segs]
                dist = [errs_r[i] + 0.05 * float(np.linalg.norm(np.array(s['pose']['t']) - np.array(sg['t']))) for i, sg in enumerate(segs)]
                k = int(np.argmin(dist)); s['seg'] = k; s['rot_err'] = errs_r[k]
                s['t_err'] = float(np.linalg.norm(np.array(s['pose']['t']) - np.array(segs[k]['t'])))
                R, tt = np.array(segs[k]['R']), np.array(segs[k]['t'])
                if s.get('align'):
                    A = s['align']; gtp = []
                    for x in (-1, 1):
                        for y in (-1, 1):
                            for z in (-1, 1):
                                X = np.array([x, y, z]) * 35.0 + (np.array([0, 35.7, 0]) if gt.get('card') else 0); c = R @ X + tt
                                u = K['fx'] * c[0] / c[2] + K['cx']; v = K['fy'] * c[1] / c[2] + K['cy']
                                gtp.append([(u - A['ox']) * A['s'], (v - A['oy']) * A['s']])
                    gl, cv, gtp = np.array(A['gl']), np.array(A['cv']), np.array(gtp)
                    s['gl_vs_cv_px'] = float(np.abs(gl - cv).max()); s['gl_vs_truth_px'] = float(np.linalg.norm(gl - gtp, axis=1).max())
                if s.get('gAR'):
                    s['g_err'] = math.degrees(math.acos(max(-1, min(1, float(np.dot(s['gAR'], segs[k]['g_cube']))))))
                key = (k, s['phase'])
                if s['tracking'] and key not in shots and (s['wall'] > 3):
                    shots.add(key); await pg.screenshot(path=f'{OUT}/ar_seg{k}_{s["phase"]}.png')
            samples.append(s)
        await pg.screenshot(path=f'{OUT}/ar_99_end.png')
        await b.close()
    srv.terminate()

    # ---- report
    tracked = [s for s in samples if s.get('tracking')]
    print(f'samples {len(samples)}, tracked {len(tracked)}, video {samples[-1]["vw"]}x{samples[-1]["vh"]}, tracker fps ~{np.median([s["fps"] for s in samples]):.1f}, cv {np.median([s["cv"] for s in samples]):.0f} ms')
    for k, sg in enumerate(segs):
        ss = [s for s in tracked if s.get('seg') == k]
        if not ss: print(f'  seg {k} {sg["name"]}: cube not tracked (expected only for "out of view")'); continue
        def med(key): return np.median([s[key] for s in ss if key in s])
        print(f'  seg {k} {sg["name"]:22s} n={len(ss):3d}  rot err {med("rot_err"):.2f}°  pos err {med("t_err"):.1f} mm  '
              f'overlay vs truth {med("gl_vs_truth_px"):.1f} px (max {max(s.get("gl_vs_truth_px", 0) for s in ss):.1f})  GL vs CV {max(s.get("gl_vs_cv_px", 0) for s in ss):.3f} px  gravity err {med("g_err"):.1f}°')
    # ball motion per segment while playing
    print('  timeline (phase, segment, ball face/u/v/speed, hint):')
    prev = None
    for s in samples:
        b_ = s['ball']; sp = math.hypot(b_['vu'], b_['vv'])
        if not s.get('tracking'): s['seg'] = 'lost'
        line = f'    {s["wall"]:5.1f}s {s["phase"]:5s} seg {s.get("seg", "-")} f{b_["f"]} u {b_["u"]:+.2f} v {b_["v"]:+.2f} speed {sp:.2f}  {s["hint"]}'
        if line[12:] != prev: print(line); prev = line[12:]
    print('errors:', errs[:6] or 'none')


asyncio.run(main())
