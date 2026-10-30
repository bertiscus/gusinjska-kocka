"""Turns the Xplore Prokletije logo (PNG on a white background) into clean, transparent vector shapes.

python3 tools/trace_logo.py brand/source/xplore-prokletije.png

Writes
  src/xp-logo.svg                       for the game page: shapes grouped and classed so the page sets
                                        the colours (--lg-ink, --lg-accent) and can animate the parts
  brand/xplore-prokletije.svg           original colours, transparent background
  brand/xplore-prokletije-teal.svg      game colours for light backgrounds (ink + teal)
  brand/xplore-prokletije-light.svg     game colours for dark backgrounds (cream + mint)
  brand/*.png                           the same three, 2400 px wide, transparent background

How: every pixel is split into "white background", "dark ink" and "blue" shares (linear unmixing),
the shares are upscaled 4x and traced at 50 % with OpenCV, and the outlines are simplified a little
(more for the straight-edged house and squares, less for the lettering). Holes (windows, door) stay holes.
"""
import os, sys
import numpy as np, cv2

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
UP = 4
BG = np.array([253, 253, 253.0]); INK = np.array([23, 34, 42.0]); BLUE = np.array([0, 90, 247.0])
COLOURS = {
    'original': ('#17222a', '#005af7'),
    'teal': ('#1a2928', '#0b7b77'),
    'light': ('#efe9dc', '#4fc3b5'),
}


def shares(img):
    """Least-squares split of each pixel into ink and blue shares (0..1) over the white background."""
    A = np.stack([INK - BG, BLUE - BG], 1)                 # 3 x 2
    P = np.linalg.pinv(A)                                   # 2 x 3
    x = (img.reshape(-1, 3) - BG) @ P.T
    x = np.clip(x, 0, 1).reshape(img.shape[0], img.shape[1], 2)
    return x[..., 0], x[..., 1]


def trace(mask_soft, eps_for):
    """Outlines of one colour: list of (top-level bbox, [polygons]) per connected shape (holes included)."""
    big = cv2.resize(mask_soft.astype(np.float32), None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    m = (big > 0.5).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cs, hier = cv2.findContours(m, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
    if hier is None:
        return []
    hier = hier[0]
    top = []
    for i in range(len(cs)):                                # top-most ancestor of every contour
        j = i
        while hier[j][3] >= 0:
            j = hier[j][3]
        top.append(j)
    shapes = {}
    for i, c in enumerate(cs):
        if cv2.contourArea(c) < 2 * UP * UP:
            continue
        x, y, w, h = cv2.boundingRect(cs[top[i]])
        box = (x / UP, y / UP, (x + w) / UP, (y + h) / UP)
        eps = eps_for(box) * UP
        poly = cv2.approxPolyDP(c, eps, True)[:, 0, :] / UP
        if len(poly) >= 3:
            shapes.setdefault(top[i], (box, []))[1].append(poly)
    return list(shapes.values())


def path_d(polys, ox, oy):
    out = []
    for p in polys:
        pts = [f'{x - ox:.1f} {y - oy:.1f}' for x, y in p]
        out.append('M' + 'L'.join(pts) + 'Z')
    return ''.join(out).replace('.0 ', ' ').replace('.0L', 'L').replace('.0Z', 'Z')


def main():
    src = sys.argv[1]
    img = cv2.cvtColor(cv2.imread(src), cv2.COLOR_BGR2RGB).astype(np.float64)
    ink, blue = shares(img)
    ink[ink < 0.08] = 0; blue[blue < 0.08] = 0
    # text sits to the right of the house; the lettering gets finer outlines than the geometric icon
    any_ink = (ink + blue) > 0.5
    ys, xs = np.nonzero(any_ink)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    split_x = x0 + 0.40 * (x1 - x0)
    is_text = lambda b: b[0] > split_x
    eps = lambda b: 0.35 if is_text(b) else 0.45
    groups = {'base': [], 'pixels': [], 'house': [], 'word1': [], 'word2': []}
    for box, polys in trace(ink, eps):
        groups['word1' if is_text(box) else 'house'].append((box, polys))
    for box, polys in trace(blue, eps):
        if is_text(box):
            groups['word2'].append((box, polys))
        elif (box[2] - box[0]) > 0.25 * (x1 - x0) or box[1] > y0 + 0.88 * (y1 - y0):
            groups['base'].append((box, polys))
        else:
            groups['pixels'].append((box, polys))
    pad = 6
    ox, oy = x0 - pad, y0 - pad
    W, H = (x1 - x0) + 2 * pad, (y1 - y0) + 2 * pad
    # pixel squares in reading order (top to bottom, left to right) so they can appear one after another
    groups['pixels'].sort(key=lambda s: (round(s[0][1] / 40), s[0][0]))
    for k, v in groups.items():
        print(f'{k}: {len(v)} shapes')

    def body(fill_ink, fill_acc, classed):
        def g(name, fill, items, each=False):
            if each:
                inner = ''.join(f'<path class="lg-px" style="--i:{n}" d="{path_d(p, ox, oy)}"/>' for n, (b, p) in enumerate(items))
            else:
                inner = f'<path d="{path_d([q for _, ps in items for q in ps], ox, oy)}"/>'
            cls = f' class="lg-{name} lg-{"ink" if fill == "ink" else "acc"}"' if classed else ''
            col = '' if classed else f' fill="{fill_ink if fill == "ink" else fill_acc}"'
            return f'<g{cls}{col} fill-rule="evenodd">{inner}</g>'
        return (g('base', 'acc', groups['base']) + g('pixels', 'acc', groups['pixels'], each=classed)
                + g('house', 'ink', groups['house']) + g('word1', 'ink', groups['word1']) + g('word2', 'acc', groups['word2']))

    vb = f'0 0 {W:.0f} {H:.0f}'
    page_svg = f'<svg class="xp-logo" viewBox="{vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">{body(None, None, True)}</svg>'
    os.makedirs(os.path.join(ROOT, 'brand'), exist_ok=True)
    open(os.path.join(ROOT, 'src', 'xp-logo.svg'), 'w').write(page_svg + '\n')
    for name, (ci, ca) in COLOURS.items():
        fn = 'xplore-prokletije.svg' if name == 'original' else f'xplore-prokletije-{name}.svg'
        open(os.path.join(ROOT, 'brand', fn), 'w').write(
            f'<svg viewBox="{vb}" width="{W:.0f}" height="{H:.0f}" xmlns="http://www.w3.org/2000/svg">'
            f'<title>Xplore Prokletije</title>{body(ci, ca, False)}</svg>\n')
    print('viewBox', vb, '| page svg', len(page_svg) // 1024, 'KB')
    render_pngs(W, H)


def render_pngs(W, H, width=2400):
    import asyncio
    from playwright.async_api import async_playwright
    names = ['xplore-prokletije', 'xplore-prokletije-teal', 'xplore-prokletije-light']
    async def run():
        async with async_playwright() as p:
            b = await p.chromium.launch()
            pg = await b.new_page(viewport={'width': width, 'height': int(round(width * H / W))})
            for n in names:
                svg = open(os.path.join(ROOT, 'brand', n + '.svg')).read().replace(f'width="{W:.0f}" height="{H:.0f}"', f'width="{width}"')
                await pg.set_content(f'<style>html,body{{margin:0;background:transparent}}svg{{display:block}}</style>{svg}')
                await pg.locator('svg').screenshot(path=os.path.join(ROOT, 'brand', n + '.png'), omit_background=True)
            await b.close()
    asyncio.run(run())


if __name__ == '__main__':
    main()
