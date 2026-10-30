"""Renders the showcase: director.html drawn frame by frame, one MP4 per scene, joined, music added.

python3 render.py stills 1.6 4.5 ...     full-size check frames -> stills/t_*.jpg
python3 render.py scenes [s1 s2 ...]     render scene files (all when none given)
python3 render.py final                  join scenes and add music -> gusinjska-kocka-showcase.mp4
"""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright

HERE = '/home/claude/gk-video'
TL = json.load(open(f'{HERE}/timeline.json'))
FPS = TL['fps']
CUTS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7']
BOUNDS = [TL[k] for k in CUTS] + [TL['end']]
SCENES = {k: (round(BOUNDS[i] * FPS), round(BOUNDS[i + 1] * FPS)) for i, k in enumerate(CUTS)}


def build_page():
    logo = open('/home/claude/gusinjska-kocka/src/xp-logo.svg').read().strip()
    qr = open(f'{HERE}/qr.svg').read().strip()
    frames = {d: len([f for f in os.listdir(f'{HERE}/frames/{d}') if f.endswith('.jpg')]) for d in os.listdir(f'{HERE}/frames') if os.path.isdir(f'{HERE}/frames/{d}')}
    html = open(f'{HERE}/director.html').read().replace('<!--LOGO-->', logo).replace('<!--QR-->', qr)
    html = html.replace('/*TL*/null', json.dumps(TL)).replace('/*FRAMES*/null', json.dumps(frames))
    open(f'{HERE}/_page.html', 'w').write(html)
    return frames


async def with_page(fn):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1080, 'height': 1920}, device_scale_factor=1)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(f'file://{HERE}/_page.html')
        await pg.evaluate('document.fonts.ready')
        await fn(pg)
        if errs: print('page errors:', errs[:5])
        await b.close()


async def stills(times):
    os.makedirs(f'{HERE}/stills', exist_ok=True)
    async def go(pg):
        for t in times:
            await pg.evaluate(f'render({t})')
            await pg.screenshot(path=f'{HERE}/stills/t_{t:05.2f}.jpg', type='jpeg', quality=92)
    await with_page(go)


async def scenes(names):
    os.makedirs(f'{HERE}/out', exist_ok=True)
    async def go(pg):
        for name in names:
            a, b = SCENES[name]
            tmp, final = f'{HERE}/out/_{name}.mp4', f'{HERE}/out/{name}.mp4'
            ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                                   '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS), tmp], stdin=subprocess.PIPE)
            for f in range(a, b):
                await pg.evaluate(f'render({f / FPS})')
                ff.stdin.write(await pg.screenshot(type='jpeg', quality=92))
            ff.stdin.close()
            if ff.wait() == 0:
                os.replace(tmp, final)
                print(f'{name}: frames {a}-{b - 1} -> {final}', flush=True)
            else:
                print(f'{name}: ffmpeg failed', flush=True)
    await with_page(go)


def final():
    lst = f'{HERE}/out/list.txt'
    open(lst, 'w').write(''.join(f"file '{HERE}/out/{k}.mp4'\n" for k in CUTS))
    v = f'{HERE}/out/_video.mp4'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', v], check=True)
    out = f'{HERE}/gusinjska-kocka-showcase.mp4'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', v, '-i', f'{HERE}/music.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out + '.tmp.mp4'], check=True)
    os.replace(out + '.tmp.mp4', out)
    print('->', out)


if __name__ == '__main__':
    cmd = sys.argv[1]
    print('frames available:', build_page())
    if cmd == 'stills':
        asyncio.run(stills([float(x) for x in sys.argv[2:]]))
    elif cmd == 'scenes':
        asyncio.run(scenes(sys.argv[2:] or CUTS))
    elif cmd == 'final':
        final()
