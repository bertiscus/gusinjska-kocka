"""App icons and the two QR cards (Android, Windows) for Gusinjska kocka.

python3 tools/make_brand.py

Writes
  icons/icon-192.png, icon-512.png        app icon (rounded tile, for Windows and browsers)
  icons/icon-maskable-512.png             app icon for Android (full bleed, content in the safe circle)
  icons/apple-touch-icon.png, favicon-32.png
  qr/gusinjska-kocka-android.png          QR card, 1200 x 1560 px (10 x 13 cm at 300 dpi)
  qr/gusinjska-kocka-windows.png
  qr/gusinjska-kocka-qr-a4.pdf            print sheet: two of each card, with cut lines
and checks that every QR code decodes to its link (OpenCV), also small, blurred and at an angle.

Needs reportlab (QR encoder), playwright (rendering) and opencv-python (scan check).
Fonts: tools/fonts (Marcellus, Golos Text; SIL Open Font License).
"""
import asyncio, os, sys
from reportlab.graphics.barcode import qrencoder as qe

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SITE = 'https://bertiscus.github.io/gusinjska-kocka/'
CARDS = [  # file id, label under the name, link in the code
    ('android', 'Android', SITE + '?p=android'),
    ('windows', 'Windows', SITE + '?p=windows'),
]
INK = '#0e2427'          # QR modules: very dark teal, scans like black
CLEAR = 15               # modules left white in the middle for the Xplore Prokletije badge (of 41)
BADGE = 13.4             # badge size in modules

RIDGE_BACK = 'M4 62 L38 34 L52 44 L80 14 L98 30 L112 22 L138 46 L160 26 L176 36 L198 18 L236 62'
RIDGE_FRONT = 'M4 62 L30 48 L50 56 L74 38 L96 52 L120 34 L146 54 L170 42 L196 56 L236 62'
RIDGE_SNOW = 'M72 20 L80 14 L88 22 M190 24 L198 18 L205 25'


def qr_matrix(text):
    q = qe.QRCode(None, qe.QRErrorCorrectLevel.H)
    q.addData(text)
    q.make()
    n = q.getModuleCount()
    return [[bool(q.isDark(r, c)) for c in range(n)] for r in range(n)]


def ridge(x, y, w, sw=1.0):
    """The Xplore Prokletije ridge mark, w wide, top-left at (x, y)."""
    s = w / 240
    return (f'<g transform="translate({x:.3f} {y:.3f}) scale({s:.5f})" fill="none" stroke-linecap="round" stroke-linejoin="round">'
            f'<path d="{RIDGE_BACK}" stroke="#8fb9ae" stroke-width="{4.2 * sw:.2f}"/>'
            f'<path d="{RIDGE_FRONT}" stroke="#4fc3b5" stroke-width="{5.2 * sw:.2f}"/>'
            f'<path d="{RIDGE_SNOW}" stroke="#ffffff" stroke-width="{5.2 * sw:.2f}"/></g>')


def badge(cx, cy, b, gid):
    """Xplore Prokletije badge, b wide, centred on (cx, cy). Units are QR modules."""
    x, y = cx - b / 2, cy - b / 2
    return (f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#0e2427"/><stop offset="0.55" stop-color="#163a3b"/><stop offset="1" stop-color="#1f4a45"/></linearGradient></defs>'
            f'<rect x="{x:.3f}" y="{y:.3f}" width="{b:.3f}" height="{b:.3f}" rx="{b * 0.17:.3f}" fill="url(#{gid})"/>'
            + ridge(x + b * 0.15, y + b * 0.15, b * 0.70)
            + f'<text x="{cx:.3f}" y="{y + b * 0.665:.3f}" text-anchor="middle" font-family="Marcellus" font-size="{b * 0.285:.3f}" fill="#efe9dc">Xplore</text>'
            + f'<text x="{cx + b * 0.022:.3f}" y="{y + b * 0.835:.3f}" text-anchor="middle" font-family="Golos Text" font-weight="600" '
              f'font-size="{b * 0.088:.3f}" letter-spacing="{b * 0.034:.3f}" fill="#a9d4ca">PROKLETIJE</text>')


def qr_svg(text, gid):
    m = qr_matrix(text)
    n = len(m)
    lo = (n - CLEAR) // 2
    hi = lo + CLEAR
    d = []
    for r in range(n):
        c = 0
        while c < n:
            if m[r][c] and not (lo <= r < hi and lo <= c < hi):
                c0 = c
                while c < n and m[r][c] and not (lo <= r < hi and lo <= c < hi):
                    c += 1
                d.append(f'M{c0} {r}h{c - c0}v1h{c0 - c}z')
            else:
                c += 1
    q = 4  # quiet zone
    return (f'<svg class="qr" viewBox="{-q} {-q} {n + 2 * q} {n + 2 * q}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">'
            f'<rect x="{-q}" y="{-q}" width="{n + 2 * q}" height="{n + 2 * q}" fill="#fff"/>'
            f'<path d="{"".join(d)}" fill="{INK}"/>'
            f'<g shape-rendering="geometricPrecision">{badge(n / 2, n / 2, BADGE, gid)}</g></svg>'), n


def icon_svg(kind):
    """kind: 'tile' (rounded, transparent corners), 'full' (full bleed), 'maskable' (full bleed, smaller content)."""
    k = 0.78 if kind == 'maskable' else 1.0
    rx = 112 if kind == 'tile' else 0
    s = 148 * k                        # isometric cube half-width
    cx, cy = 256, 262
    top = (cx, cy - s), (cx + s * 0.866, cy - s / 2), (cx, cy), (cx - s * 0.866, cy - s / 2)
    P = lambda pts: ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    a, b = s * 0.866, s / 2
    # the Prokletije ridge drawn around the two side faces (face-local 0..1 coordinates), snow on the high peaks
    lpts = [(0, 0.66), (0.2, 0.46), (0.34, 0.58), (0.58, 0.26), (0.76, 0.46), (1, 0.36)]
    rpts = [(0, 0.36), (0.2, 0.2), (0.36, 0.42), (0.54, 0.3), (0.72, 0.52), (0.88, 0.44), (1, 0.56)]
    sw = 9 * k
    def ridge_on(pts, m, fill):
        # m = (a, b, c, d, e, f): face-local (x, y) -> icon (a x + c y + e, b x + d y + f)
        X = lambda x, y: f'{m[0] * x + m[2] * y + m[4]:.1f} {m[1] * x + m[3] * y + m[5]:.1f}'
        line = 'M' + ' L'.join(X(x, y) for x, y in pts)
        snow = ''
        for i in range(1, len(pts) - 1):
            (x0, y0), (x1, y1), (x2, y2) = pts[i - 1], pts[i], pts[i + 1]
            if y1 < y0 and y1 < y2 and y1 < 0.32:
                f = 0.38
                snow += f'M{X(x1 + (x0 - x1) * f, y1 + (y0 - y1) * f)} L{X(x1, y1)} L{X(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f)} '
        st = f'fill="none" stroke-width="{sw:.1f}" stroke-linecap="round" stroke-linejoin="round"'
        return (f'<path d="{line} L{X(1, 1)} L{X(0, 1)} Z" fill="{fill}"/>'
                f'<path d="{line}" stroke="#4fc3b5" {st}/><path d="{snow}" stroke="#ffffff" {st}/>')
    faces = (ridge_on(lpts, (a, b, 0, s, cx - a, cy - b), '#0a6b67')
             + ridge_on(rpts, (a, -b, 0, s, cx, cy), '#074f4c'))
    br = 30 * k
    return f'''<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="bg-{kind}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e2427"/><stop offset="0.6" stop-color="#163a3b"/><stop offset="1" stop-color="#24524c"/></linearGradient>
<radialGradient id="ball-{kind}" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#e9efe9"/><stop offset="1" stop-color="#9fb3ad"/></radialGradient></defs>
<rect width="512" height="512" rx="{rx}" fill="url(#bg-{kind})"/>
<polygon points="{P(top)}" fill="#e8ebe5"/>
<polygon points="{P(((cx - s * 0.866, cy - s / 2), (cx, cy), (cx, cy + s), (cx - s * 0.866, cy + s / 2)))}" fill="#0f8a84"/>
<polygon points="{P(((cx, cy), (cx + s * 0.866, cy - s / 2), (cx + s * 0.866, cy + s / 2), (cx, cy + s)))}" fill="#0b6d69"/>
{faces}
<polygon points="{P(top)}" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="{4 * k:.1f}" stroke-linejoin="round"/>
<ellipse cx="{cx + 6 * k:.1f}" cy="{cy - s / 2 + br * 0.9:.1f}" rx="{br * 1.05:.1f}" ry="{br * 0.45:.1f}" fill="#0e2427" opacity="0.28"/>
<circle cx="{cx:.1f}" cy="{cy - s / 2:.1f}" r="{br:.1f}" fill="url(#ball-{kind})"/>
</svg>'''


CSS = '''
@font-face { font-family: 'Marcellus'; src: url('../tools/fonts/Marcellus-Regular.ttf'); }
@font-face { font-family: 'Golos Text'; src: url('../tools/fonts/GolosText-VF.ttf'); font-weight: 400 900; }
html, body { margin: 0; background: #fff; }
.card { position: relative; width: 100em; height: 130em; background: #fff; color: #1a2928; overflow: hidden;
        display: flex; flex-direction: column; align-items: center; font-family: 'Golos Text', sans-serif; }
.card .qr { display: block; width: 84em; height: 84em; margin-top: 5em; }
.card h1 { font-family: 'Marcellus', serif; font-weight: 400; font-size: 10.4em; line-height: 1; margin: 0.1em 0 0; letter-spacing: 0.005em; }
.card .plat { margin: 0.75em 0 0; font-weight: 600; font-size: 4.2em; letter-spacing: 0.22em; text-transform: uppercase; color: #0b7b77;
              padding: 0.42em 0.9em 0.42em 1.12em; border: 0.11em solid #0b7b77; border-radius: 2em; line-height: 1; }
.card .url { position: absolute; left: 0; right: 0; bottom: 1.1em; margin: 0; text-align: center; font-size: 3.1em; color: #fff; letter-spacing: 0.02em; }
.card .foot { position: absolute; left: 0; right: 0; bottom: 0; width: 100em; height: 13.5em; }
'''


def card_html(cid, label, url):
    svg, n = qr_svg(url, f'g-{cid}')
    foot = (f'<svg class="foot" viewBox="0 0 240 36" preserveAspectRatio="none">'
            f'<path d="M0 36 L0 14 L30 8 L50 11.5 L74 3 L96 9.5 L120 2 L146 10.5 L170 5.5 L196 11 L240 6.5 L240 36 Z" fill="#163a3b"/>'
            f'<path d="M0 14 L30 8 L50 11.5 L74 3 L96 9.5 L120 2 L146 10.5 L170 5.5 L196 11 L240 6.5" fill="none" stroke="#4fc3b5" stroke-width="0.9"/></svg>')
    return (f'<div class="card" id="card-{cid}">{svg}<h1>Gusinjska kocka</h1><p class="plat">{label}</p>'
            f'{foot}<p class="url">{url.split("://")[1].split("?")[0].rstrip("/")}</p></div>')


def sheet_html():
    cards = ''.join(card_html(c, l, u).replace(f'id="card-{c}"', '') .replace(f'g-{c}', f'g-{c}-{i}')
                    for i in range(2) for c, l, u in CARDS)
    return f'''<!doctype html><meta charset="utf-8"><style>{CSS}
@page {{ size: A4; margin: 0; }}
.sheet {{ width: 210mm; height: 297mm; display: grid; grid-template-columns: 90mm 90mm; gap: 8mm 10mm; justify-content: center; align-content: center; }}
.sheet .card {{ font-size: 0.9mm; outline: 0.25mm dashed #9aa8a5; }}
</style><div class="sheet">{cards}</div>'''


async def render():
    from playwright.async_api import async_playwright
    tmp = os.path.join(ROOT, 'tmp')
    os.makedirs(tmp, exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'icons'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'qr'), exist_ok=True)
    cards = ''.join(card_html(*c) for c in CARDS)
    icons = [('icon-512', 'tile', 512), ('icon-192', 'tile', 192), ('icon-maskable-512', 'maskable', 512),
             ('apple-touch-icon', 'full', 180), ('favicon-32', 'tile', 32)]
    icon_divs = ''.join(f'<div id="{name}" style="flex:none;width:{px}px;height:{px}px">{icon_svg(kind).replace("<svg ", "<svg width=\"100%\" height=\"100%\" ")}</div>'
                        for name, kind, px in icons)
    page_html = f'<!doctype html><meta charset="utf-8"><style>{CSS} html, body {{ background: transparent; }} .card {{ font-size: 4px; margin: 0 0 20px; }}</style>{cards}<div style="display:flex;gap:10px;align-items:flex-start">{icon_divs}</div>'
    open(os.path.join(tmp, 'brand.html'), 'w').write(page_html)
    open(os.path.join(tmp, 'sheet.html'), 'w').write(sheet_html())
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 1200}, device_scale_factor=3)
        await pg.goto('file://' + os.path.join(tmp, 'brand.html'))
        await pg.evaluate('document.fonts.ready')
        for cid, _, _ in CARDS:
            await pg.locator(f'#card-{cid}').screenshot(path=os.path.join(ROOT, 'qr', f'gusinjska-kocka-{cid}.png'))
        pg1 = await b.new_page(viewport={'width': 1400, 'height': 1200}, device_scale_factor=1)
        await pg1.goto('file://' + os.path.join(tmp, 'brand.html'))
        await pg1.evaluate('document.fonts.ready')
        for name, kind, px in icons:
            await pg1.locator(f'#{name}').screenshot(path=os.path.join(ROOT, 'icons', f'{name}.png'), omit_background=(kind == 'tile'))
        ps = await b.new_page()
        await ps.goto('file://' + os.path.join(tmp, 'sheet.html'))
        await ps.evaluate('document.fonts.ready')
        await ps.pdf(path=os.path.join(ROOT, 'qr', 'gusinjska-kocka-qr-a4.pdf'), format='A4', print_background=True,
                     margin={'top': '0', 'bottom': '0', 'left': '0', 'right': '0'})
        await b.close()


def check():
    """Every code must decode to its link: full size, small, blurred, at an angle."""
    import cv2, numpy as np
    dets = [('opencv', cv2.QRCodeDetector())]
    if hasattr(cv2, 'QRCodeDetectorAruco'):
        dets.append(('opencv-aruco', cv2.QRCodeDetectorAruco()))
    ok = True
    for cid, _, url in CARDS:
        img = cv2.imread(os.path.join(ROOT, 'qr', f'gusinjska-kocka-{cid}.png'))
        h, w = img.shape[:2]
        tests = {'full': img, 'small 300px': cv2.resize(img, (300, int(300 * h / w)), interpolation=cv2.INTER_AREA),
                 'blurred': cv2.GaussianBlur(img, (0, 0), 3.0)}
        src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        dst = np.float32([[w * 0.08, h * 0.04], [w * 0.92, 0], [w, h], [0, h * 0.95]])
        tests['angled'] = cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (w, h), borderValue=(255, 255, 255))
        for tname, im in tests.items():
            res = []
            for dname, det in dets:
                txt = det.detectAndDecode(im)[0]
                res.append(f'{dname}={"ok" if txt == url else repr(txt)}')
                ok &= (txt == url) or dname != 'opencv'
            print(f'  {cid:8s} {tname:12s} ' + '  '.join(res))
    return ok


if __name__ == '__main__':
    for cid, _, url in CARDS:
        print(cid, url, f'-> QR version {(len(qr_matrix(url)) - 17) // 4}, error correction H, {CLEAR}x{CLEAR} modules under the badge')
    asyncio.run(render())
    good = check()
    print('all codes decode' if good else 'SOME CODES DO NOT DECODE')
    sys.exit(0 if good else 1)
