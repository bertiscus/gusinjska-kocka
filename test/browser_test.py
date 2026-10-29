import asyncio, json, os, sys, time
from playwright.async_api import async_playwright

URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html'))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='sr-Latn-ME')
        page = await ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        await page.route('http*://**', lambda r: r.abort())
        await page.goto(URL)
        await page.wait_for_timeout(1800)
        await page.screenshot(path=f'{OUT}/01_title.png')

        await page.click('#btnPlay')
        await page.wait_for_timeout(1200)
        await page.screenshot(path=f'{OUT}/02_play_start.png')
        before = await page.evaluate('({...__gk.game.ball, phase: __gk.game.phase})')

        # Drag down-right slowly: tilt the cube so the ball rolls
        await page.mouse.move(195, 420)
        await page.mouse.down()
        for k in range(12):
            await page.mouse.move(195 + k * 2, 420 + k * 4)
            await page.wait_for_timeout(30)
        await page.mouse.up()
        await page.wait_for_timeout(1200)
        after = await page.evaluate('({...__gk.game.ball, phase: __gk.game.phase, time: __gk.game.time})')
        await page.screenshot(path=f'{OUT}/03_after_drag.png')
        print('ball before', json.dumps(before))
        print('ball after ', json.dumps(after))

        # Buttons: spin and level
        await page.click('#btnSpinL'); await page.wait_for_timeout(500)
        await page.click('#btnFlat'); await page.wait_for_timeout(500)
        await page.screenshot(path=f'{OUT}/04_after_buttons.png')

        # Autoplay every level
        results = []
        for k in range(3):
            await page.evaluate(f'__gk.setDemo(true); __gk.setTimeScale(3); __gk.startLevel({k}, "play")')
            t0 = time.time(); shot_mid = False; seen_toast = False
            while time.time() - t0 < 90:
                await page.wait_for_timeout(250)
                st = await page.evaluate('({screen: __gk.screen, visited: __gk.game.visited.size, total: __gk.game.total, t: __gk.game.time, toast: !document.getElementById("toast").hidden})')
                if st['toast'] and not seen_toast and k == 2:
                    seen_toast = True
                    await page.screenshot(path=f'{OUT}/05_l3_toast.png')
                if not shot_mid and st['t'] > 6 and k == 1:
                    shot_mid = True
                    await page.screenshot(path=f'{OUT}/06_l2_mid.png')
                if st['screen'] == 'done':
                    break
            results.append(st)
            await page.screenshot(path=f'{OUT}/07_done_l{k+1}.png')
            print(f'level {k+1}:', json.dumps(st), f'wall {time.time()-t0:.1f}s')
        await page.evaluate('__gk.setDemo(false); __gk.setTimeScale(1)')
        await page.click('#btnLevels')
        await page.wait_for_timeout(1200)
        await page.screenshot(path=f'{OUT}/08_title_after.png')
        fps = await page.evaluate('''new Promise(r => { let n = 0; const t0 = performance.now(); function f(){ n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); } requestAnimationFrame(f); })''')
        print('fps (headless software GL):', fps)
        print('errors:', errors if errors else 'none')
        await b.close()

asyncio.run(main())
