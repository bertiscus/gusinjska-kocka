"""Fake phone-camera frames for the AR shot: the printed marker cube held above a wooden table.

python3 camscene.py            -> cam/0000.jpg ... and cam/meta.json (intrinsics, camera up, poses)

Portrait 720 x 1280, 30 fps. The table and wall are drawn from simple procedural textures with depth blur;
the cube faces carry the real marker layout (ar/layout.json) so the game's tracker finds them.
"""
import json, math, os
import numpy as np, cv2

LAY = json.load(open('/home/claude/gusinjska-kocka/ar/layout.json'))
S = LAY['edge']
W, H = 720, 1280
FOV = 60.0                                             # along the long side
F = (max(W, H) / 2) / math.tan(math.radians(FOV / 2))
K = np.array([[F, 0, W / 2], [0, F, H / 2], [0, 0, 1.0]])
FPS = 30
N_FRAMES = 186
OUT = '/home/claude/gk-video/cam'
rng = np.random.default_rng(7)


def rot(axis, deg):
    return cv2.Rodrigues(np.array(axis, float) * math.radians(deg))[0]


def look_at(C, target=(0, 0, 0), up=(0, 1, 0)):
    f = np.array(target, float) - C; f /= np.linalg.norm(f)
    r = np.cross(f, up); r /= np.linalg.norm(r)
    d = np.cross(f, r)
    return np.stack([r, d, f])


C = np.array([0.0, 150.0, 255.0])
RWC = look_at(C, (0, -12, 0))
UP_CAM = RWC @ np.array([0, 1.0, 0])
TABLE_Y = -150.0


def smooth_noise(shape, scale, octaves=4):
    out = np.zeros(shape, np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        s = max(2, int(shape[0] / (scale / 2 ** o))), max(2, int(shape[1] / (scale / 2 ** o)))
        n = rng.random(s).astype(np.float32)
        out += amp * cv2.resize(n, (shape[1], shape[0]), interpolation=cv2.INTER_CUBIC); tot += amp; amp *= 0.5
    return out / tot


def wood_texture():
    """Plane texture: x in [-1000, 1000] mm, z in [-600, 600] mm, 1 px = 1 mm. Planks run along x."""
    h, w = 1200, 2000
    zz, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    plank_w = 140
    idx = (zz // plank_w).astype(int)
    warp = smooth_noise((h, w), 300) * 40 + smooth_noise((h, w), 60) * 6
    grain = np.sin((zz + warp) * 0.55 + idx * 3.1) * 0.5 + 0.5
    fine = smooth_noise((h, w), 8, 2)
    tone = 0.9 + 0.1 * np.sin(idx * 2.3 + 1.0)
    base = np.array([112, 74, 46], np.float32)        # warm oak (BGR order is applied below)
    light = np.array([168, 120, 82], np.float32)
    mix = np.clip(0.35 * grain + 0.45 * fine + 0.2 * smooth_noise((h, w), 120), 0, 1)[..., None]
    col = (base * (1 - mix) + light * mix) * tone[..., None]
    seam = np.abs(((zz + 0.5) % plank_w) - 0.5) < 1.6
    col[seam] *= 0.55
    return np.clip(col[..., ::-1], 0, 255).astype(np.float32)   # to BGR


def background():
    v, u = np.mgrid[0:H, 0:W].astype(np.float32)
    rays = np.stack([(u - W / 2) / F, (v - H / 2) / F, np.ones_like(u)], -1) @ RWC   # world directions
    dy = rays[..., 1]
    img = np.zeros((H, W, 3), np.float32); dist = np.zeros((H, W), np.float32)
    # table
    t = (TABLE_Y - C[1]) / np.where(dy < -1e-6, dy, -1e-6)
    px, pz = C[0] + t * rays[..., 0], C[2] + t * rays[..., 2]
    on_table = (dy < -1e-6) & (pz > -480)
    tex = wood_texture()
    mx = (px + 1000).astype(np.float32); mz = (pz + 600).astype(np.float32)
    wood = cv2.remap(tex, mx, mz, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    # light falloff on the table (a lamp up and to the left)
    lamp = np.exp(-(((px + 160) / 520) ** 2 + ((pz + 80) / 480) ** 2))
    wood = wood * (0.62 + 0.5 * lamp[..., None])
    img[on_table] = wood[on_table]; dist[on_table] = t[on_table]
    # wall behind the table
    tw = (-490 - C[2]) / np.where(rays[..., 2] < -1e-6, rays[..., 2], -1e-6)
    wy = C[1] + tw * dy; wx = C[0] + tw * rays[..., 0]
    wall = ~on_table
    wcol = np.array([196, 210, 222], np.float32)      # BGR: warm off-white
    glow = np.exp(-(((wx + 260) / 420) ** 2 + ((wy - 120) / 360) ** 2))
    shade = 0.62 + 0.42 * glow - 0.0006 * np.clip(-(wy - 300), 0, 600)
    img[wall] = (wcol * shade[..., None])[wall]; dist[wall] = np.abs(tw[wall])
    # table edge: a darker band where table meets the wall
    edge = on_table & (pz < -440)
    img[edge] *= 0.7
    return img, dist


def depth_blur(img, dist, focus):
    layers = [(0, img)] + [(s, cv2.GaussianBlur(img, (0, 0), s)) for s in (2.5, 6, 12)]
    coc = np.clip(np.abs(dist - focus) / focus * 9.0, 0, 12)
    out = np.zeros_like(img)
    sig = np.array([l[0] for l in layers], np.float32)
    for k in range(len(layers) - 1):
        a, b = sig[k], sig[k + 1]
        w = np.clip((coc - a) / (b - a), 0, 1)
        m = (coc >= a) & (coc <= b) if k < len(layers) - 2 else (coc >= a)
        blend = layers[k][1] * (1 - w[..., None]) + layers[k + 1][1] * w[..., None]
        out[m] = blend[m]
    return out


def face_image(fi, ppmm=14):
    n = int(round(S * ppmm)); img = np.full((n, n), 255, np.uint8); cell = LAY['cell']
    for m in LAY['markers']:
        if m['face'] != fi: continue
        cu, cv_ = m['center_uv']
        for i in range(8):
            for j in range(8):
                if not m['cells'][i][j]: continue
                u0 = cu - 4 * cell + j * cell; v1 = cv_ + 4 * cell - i * cell
                x0 = int(round((u0 + S / 2) * ppmm)); x1 = int(round((u0 + cell + S / 2) * ppmm))
                y0 = int(round((S / 2 - v1) * ppmm)); y1 = int(round((S / 2 - v1 + cell) * ppmm))
                img[y0:y1, x0:x1] = 0
    return img


FACES = [face_image(i) for i in range(6)]
LIGHT = np.array([-0.35, 0.9, 0.3]); LIGHT /= np.linalg.norm(LIGHT)


def smoothstep(a, b, x):
    t = min(1, max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def pose_at(f):
    """World rotation and position of the cube at frame f (hand-held, no hand drawn)."""
    t = f / FPS
    yaw = rot([0, 1, 0], 30)
    enter = smoothstep(0.45, 1.25, t)                       # slides in from the right
    pos = np.array([260 * (1 - enter), 0, 0]) + np.array([0, 4 * math.sin(t * 1.7), 0])
    a1 = 19 * smoothstep(2.0, 2.9, t) - 19 * smoothstep(3.7, 4.4, t)     # towards the camera, then back
    a2 = -17 * smoothstep(3.8, 4.6, t) + 9 * smoothstep(5.2, 6.0, t)     # right side down, then partly back
    Rw = rot([1, 0, 0], a1) @ rot([0, 0, 1], a2) @ yaw
    return Rw, pos


def main():
    os.makedirs(OUT, exist_ok=True)
    bg, dist = background()
    bg = depth_blur(bg, dist, 330)
    # vignette and grade
    v, u = np.mgrid[0:H, 0:W].astype(np.float32)
    vig = 1 - 0.32 * (((u - W / 2) / (W * 0.75)) ** 2 + ((v - H * 0.55) / (H * 0.7)) ** 2)
    bg = bg * vig[..., None]
    poses = []
    for f in range(N_FRAMES):
        Rw, pos = pose_at(f)
        img = bg.copy()
        # soft shadow on the table under the cube (light from above)
        corners = np.array([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]) * S / 2
        wc = corners @ Rw.T + pos
        sh = wc.copy(); sh[:, 1] = TABLE_Y; sh[:, 0] += (wc[:, 1] - TABLE_Y) * 0.25
        pts = []
        for X in sh:
            c = RWC @ (X - C); p = K @ c; pts.append(p[:2] / p[2])
        hull = cv2.convexHull(np.float32(pts))
        mask = np.zeros((H, W), np.float32); cv2.fillConvexPoly(mask, hull.astype(np.int32), 1.0)
        mask = cv2.GaussianBlur(mask, (0, 0), 26)
        img *= (1 - 0.42 * mask)[..., None]
        # cube faces
        R = RWC @ Rw; t = RWC @ (pos - C)
        for fi, fc in enumerate(LAY['faces']):
            U, V, Nn = (np.array(x, float) for x in (fc['U'], fc['V'], fc['N']))
            O = Nn * S / 2
            if (R @ Nn) @ (R @ O + t) >= 0: continue
            half = S / 2
            quad = [O - half * U + half * V, O + half * U + half * V, O + half * U - half * V, O - half * U - half * V]
            pts = []
            for X in quad:
                p = K @ (R @ X + t); pts.append(p[:2] / p[2])
            tex = FACES[fi]; n = tex.shape[0]
            Hm = cv2.getPerspectiveTransform(np.float32([[0, 0], [n, 0], [n, n], [0, n]]), np.float32(pts))
            shade = 0.5 + 0.55 * max(0.0, float((Rw @ Nn) @ LIGHT))
            paper = np.array([228, 236, 240], np.float32) * shade      # BGR warm paper
            ink = np.array([30, 30, 34], np.float32) * (0.6 + 0.4 * shade)
            a = (tex.astype(np.float32) / 255.0)
            face = paper * a[..., None] + ink * (1 - a[..., None])
            warped = cv2.warpPerspective(face, Hm, (W, H), flags=cv2.INTER_LINEAR)
            m = cv2.warpPerspective(np.ones((n, n), np.float32), Hm, (W, H), flags=cv2.INTER_LINEAR)
            img = img * (1 - m[..., None]) + warped * m[..., None]
        img = cv2.GaussianBlur(img, (0, 0), 0.7) + rng.normal(0, 2.2, img.shape)
        cv2.imwrite(f'{OUT}/{f:04d}.jpg', np.clip(img, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 94])
        poses.append({'R_world': Rw.tolist(), 'pos': pos.tolist()})
    json.dump({'W': W, 'H': H, 'fov': FOV, 'up_cam': UP_CAM.tolist(), 'fps': FPS, 'frames': N_FRAMES, 'poses': poses},
              open(f'{OUT}/meta.json', 'w'))
    print('wrote', N_FRAMES, 'frames; up_cam', np.round(UP_CAM, 3))


if __name__ == '__main__':
    main()
