"""Films the real game frame by frame (virtual clock, 30 fps) and saves JPEG frames.

python3 capture.py SCENE   (scenes are defined at the bottom)
"""
import asyncio, os, subprocess, sys, time, json
from playwright.async_api import async_playwright

GAME = '/home/claude/gusinjska-kocka'
OUT = '/home/claude/gk-video/frames'
PORT = int(os.environ.get('PORT', '8801'))
FPS = 30
VIRTUAL = """
(() => {
  let vt = 1000; const q = [];
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  performance.now = () => vt;
  window.__vt = { step(ms) { vt += ms; const run = q.splice(0); for (const cb of run) { try { cb(vt); } catch (e) { console.error(e); } } }, now: () => vt };
})();
"""

CAM_SHIM = """
(() => {
  const cam = document.createElement('canvas'); cam.width = 720; cam.height = 1280;
  const g = cam.getContext('2d'); g.fillStyle = '#6b5a4a'; g.fillRect(0, 0, 720, 1280);
  let stream = null;
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => (stream = stream || cam.captureStream(0));
  window.__cam = { async show(url) { const img = new Image(); img.src = url; await img.decode(); g.drawImage(img, 0, 0);
    if (stream) stream.getVideoTracks()[0].requestFrame(); } };
})();
"""


async def film(name, setup, seconds, url_extra='', css='', before_each=None, lang='me', viewport=(540, 960), camera=False):
    os.makedirs(f'{OUT}/{name}', exist_ok=True)
    for f in os.listdir(f'{OUT}/{name}'):
        os.remove(f'{OUT}/{name}/{f}')
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='sr-Latn-ME')
        pg = await ctx.new_page(); errs = []
        pg.set_default_timeout(180000)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(VIRTUAL)
        if camera:
            await pg.add_init_script(CAM_SHIM)
        await pg.add_init_script(f"try {{ localStorage.setItem('gusinjska-kocka/v1', JSON.stringify({{done: {{}}, muted: false, lang: '{lang}', zoom: {{touch: 1, ar: 1}}}})); }} catch (e) {{}}")
        async def route(r):
            u = r.request.url
            if '/__cam/' in u:
                await r.fulfill(path='/home/claude/gk-video/cam/' + u.split('/__cam/')[1], content_type='image/jpeg')
            elif u.startswith(f'http://127.0.0.1:{PORT}'):
                await r.continue_()
            else:
                await r.abort()
        await pg.route('**/*', route)
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?nointro{url_extra}')
        # let models load (real time) while the virtual clock idles
        for _ in range(60):
            n = await pg.evaluate("document.getElementById('note').textContent")
            if 'Učitavam' not in n and 'Duke' not in n and 'Loading' not in n: break
            await pg.wait_for_timeout(250)
        if css:
            await pg.add_style_tag(content=css)
        await pg.evaluate("document.getAnimations().forEach(a => a.finish())")
        await setup(pg)
        n = int(round(seconds * FPS)); t0 = time.time(); meta = []
        for i in range(n):
            if before_each:
                await before_each(pg, i)
            await pg.evaluate(f"window.__vt.step({1000 / FPS})")
            await pg.evaluate("document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })")
            await pg.screenshot(path=f'{OUT}/{name}/{i:04d}.jpg', type='jpeg', quality=92)
            meta.append(await pg.evaluate("({ visited: __gk.game.visited.size, phase: __gk.game.phase, toast: !document.getElementById('toast').hidden, name: document.getElementById('toastName').textContent, tracking: !!(__gk.ar && __gk.ar.tracking) })"))
            if i == 4:
                print(f'  {name}: ~{(time.time() - t0) / 5:.2f} s per frame', flush=True)
        json.dump(meta, open(f'{OUT}/{name}/meta.json', 'w'))
        print(f'{name}: {n} frames in {time.time() - t0:.0f} s; errors: {errs[:3] or "none"}', flush=True)
        await b.close()


async def warm(pg, seconds):
    for _ in range(int(seconds * FPS)):
        await pg.evaluate(f"window.__vt.step({1000 / FPS})")


HIDE_UI = '#title, #hud, #controls, #zoom, #hint, #toast { display: none !important; }'

async def s_spin(pg):
    await warm(pg, 0.5)

async def s_level1(pg):
    await pg.evaluate("__gk.setDemo(true); __gk.setTimeScale(1); __gk.startLevel(0, 'play')")
    await warm(pg, 1.2)

async def s_level5(pg):
    await pg.evaluate("__gk.setDemo(true); __gk.setTimeScale(1); __gk.startLevel(4, 'play')")
    await warm(pg, 3.0)


CAMMETA = '/home/claude/gk-video/cam/meta.json'

async def s_ar(pg):
    await pg.evaluate("window.__cam.show('/__cam/0000.jpg')")
    await pg.click('#btnAR')
    for _ in range(120):
        if await pg.evaluate("window.__gk.mode") == 'ar': break
        await pg.wait_for_timeout(250)
    up = json.load(open(CAMMETA))['up_cam']
    await pg.evaluate(f"window.__gk.ar.upOverride = {json.dumps(up)}")
    print('  AR mode:', await pg.evaluate("[window.__gk.mode, window.__gk.ar.video.videoWidth, window.__gk.ar.video.videoHeight, window.__gk.ar.fov]"), flush=True)

async def ar_frame(pg, i):
    v0 = await pg.evaluate("window.__gk.ar.frameVersion")
    await pg.evaluate(f"window.__cam.show('/__cam/{i:04d}.jpg')")
    for _ in range(200):
        if await pg.evaluate("window.__gk.ar.frameVersion") != v0: break
        await pg.wait_for_timeout(25)

async def lang_switch(pg, i):
    if i == 32: await pg.click('[data-lang="sq"]')
    if i == 64: await pg.click('[data-lang="en"]')

SCENES = {
    'lang':   lambda: film('lang', s_spin, 3.2, before_each=lang_switch),
    'spin':   lambda: film('spin', s_spin, 4.0, css=HIDE_UI),
    'level1': lambda: film('level1', s_level1, 9.5),
    'level5': lambda: film('level5', s_level5, 7.0),
    'test':   lambda: film('test', s_level1, 0.4),
    'ar':     lambda: film('ar', s_ar, 6.2, url_extra='&fov=60', before_each=ar_frame, camera=True),
    'artest': lambda: film('artest', s_ar, 0.3, url_extra='&fov=60', before_each=lambda pg, i: ar_frame(pg, 60 + i), camera=True),
}

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=GAME, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1)
    try:
        for s in sys.argv[1:]:
            await SCENES[s]()
    finally:
        srv.terminate()

asyncio.run(main())
