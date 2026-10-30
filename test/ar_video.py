"""Synthetic phone-camera video of the printed AR cube, for testing AR mode.

python3 test/ar_video.py OUT.y4m [--size 960x540] [--fps 15] [--card] [--fov DEG] [--dist MM]

The camera sits above and in front of the cube, looking down at it. The cube goes through
segments (held still in each): level -> tilted towards the camera -> tilted to the right.
Writes OUT.y4m and OUT.json (intrinsics, camera "up", and per-segment ground-truth poses).
Pose convention: X_cam = R X_obj + t (OpenCV camera, mm), cube frame +X right, +Y up, +Z front.
"""
import json, math, os, sys
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
lay = json.load(open(os.path.join(HERE, '..', 'ar', 'layout.json')))
S = lay['edge']


def face_image(fi, ppmm=16):
    n = int(round(S * ppmm)); img = np.full((n, n), 255, np.uint8); cell = lay['cell']
    for m in lay['markers']:
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


def rot(axis, deg):
    return cv2.Rodrigues(np.array(axis, float) * math.radians(deg))[0]


def look_at(C, target=(0, 0, 0), up=(0, 1, 0)):
    f = np.array(target, float) - C; f /= np.linalg.norm(f)
    r = np.cross(f, up); r /= np.linalg.norm(r)
    d = np.cross(f, r)
    return np.stack([r, d, f])   # rows: camera x (right), y (down), z (forward) in world coords


def main():
    out = sys.argv[1]
    W, H = (int(x) for x in (sys.argv[sys.argv.index('--size') + 1] if '--size' in sys.argv else '960x540').split('x'))
    fps = int(sys.argv[sys.argv.index('--fps') + 1]) if '--fps' in sys.argv else 15
    fov_arg = float(sys.argv[sys.argv.index('--fov') + 1]) if '--fov' in sys.argv else None
    f = (max(W, H) / 2) / math.tan(math.radians(fov_arg / 2)) if fov_arg else 0.78 * max(W, H)
    K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
    C = np.array([0.0, 190.0, 250.0])           # camera position (mm), cube at the origin
    if '--dist' in sys.argv: C = C / np.linalg.norm(C) * float(sys.argv[sys.argv.index('--dist') + 1])
    Rwc = look_at(C)
    up_cam = Rwc @ np.array([0, 1.0, 0])
    yaw = rot([0, 1, 0], 28)                     # turn the cube so two side faces show
    card = '--card' in sys.argv
    if card:
        C = np.array([0.0, 330.0, 260.0]); Rwc = look_at(C); up_cam = Rwc @ np.array([0, 1.0, 0])
    segments = [
        ('level', 3.0, yaw, np.zeros(3)),
        ('towards camera 20°', 4.0, rot([1, 0, 0], 20) @ yaw, np.zeros(3)),
        ('out of view', 2.0, yaw, np.array([900.0, 0, 0])),
        ('right side down 20°', 4.0, rot([0, 0, 1], -20) @ yaw, np.zeros(3)),
    ]
    faces = [face_image(i) for i in range(6)]
    if card:
        cdef = lay['card']; ppmm = 6; size = cdef['size'] + 20; n = int(size * ppmm)
        ctex = np.full((n, n), 255, np.uint8)
        for m in cdef['markers']:
            cu, cv_ = m['center_uv']
            for i in range(8):
                for j in range(8):
                    if m['cells'][i][j]:
                        u0 = cu - 4 * cdef['cell'] + j * cdef['cell']; v1 = cv_ + 4 * cdef['cell'] - i * cdef['cell']
                        x0 = int(round((u0 + size / 2) * ppmm)); y0 = int(round((size / 2 - v1) * ppmm))
                        ctex[y0:y0 + int(round(cdef['cell'] * ppmm)), x0:x0 + int(round(cdef['cell'] * ppmm))] = 0
        planes = [(ctex, [1, 0, 0], [0, 0, -1], [0, 1, 0], np.zeros(3), size / 2)]
    else:
        planes = [(faces[fi], fc['U'], fc['V'], fc['N'], np.array(fc['N'], float) * S / 2, S / 2) for fi, fc in enumerate(lay['faces'])]
    rng = np.random.default_rng(3)
    # static background: wall/table with some clutter
    bg = np.ones((H, W, 3), np.float32) * np.array([150, 160, 168], np.float32)
    bg *= np.linspace(1.08, 0.82, H)[:, None, None]
    for _ in range(14):
        col = rng.uniform(40, 220, 3).tolist(); x, y = int(rng.uniform(0, W)), int(rng.uniform(0, H))
        cv2.rectangle(bg, (x, y), (x + int(rng.uniform(20, 160)), y + int(rng.uniform(20, 120))), col, -1)
    light = np.array([0.3, 0.9, 0.4]); light /= np.linalg.norm(light)
    gt = []
    with open(out, 'wb') as fh:
        fh.write(f'YUV4MPEG2 W{W} H{H} F{fps}:1 Ip A1:1 C420jpeg\n'.encode())
        n_frames = 0
        for name, secs, Rw, pos in segments:
            R = Rwc @ Rw; t = Rwc @ (pos - C)
            gt.append({'name': name, 'start': n_frames / fps, 'end': (n_frames + int(secs * fps)) / fps, 'R': R.tolist(), 't': t.tolist(),
                       'R_world': Rw.tolist(), 'g_cube': (Rw.T @ np.array([0, -1.0, 0])).tolist()})
            img = bg.copy()
            for tex, U, V, Nn, O, half in planes:
                U, V, Nn = (np.array(x, float) for x in (U, V, Nn))
                n_cam = R @ Nn; c_cam = R @ O + t
                if n_cam @ c_cam >= 0: continue
                corners = [O - half * U + half * V, O + half * U + half * V, O + half * U - half * V, O - half * U - half * V]
                pts = []
                for X in corners:
                    p = K @ (R @ X + t); pts.append(p[:2] / p[2])
                n = tex.shape[0]
                Hm = cv2.getPerspectiveTransform(np.float32([[0, 0], [n, 0], [n, n], [0, n]]), np.float32(pts))
                shade = 0.45 + 0.55 * max(0.0, float(Rw @ Nn @ light))
                albedo = (28 + 207 * tex.astype(np.float32) / 255.0) * shade
                warped = cv2.warpPerspective(albedo, Hm, (W, H), flags=cv2.INTER_LINEAR)
                mask = cv2.warpPerspective(np.ones_like(albedo), Hm, (W, H), flags=cv2.INTER_LINEAR)
                img = img * (1 - mask[..., None]) + warped[..., None] * mask[..., None]
            for k in range(int(secs * fps)):
                fr = np.clip(cv2.GaussianBlur(img, (0, 0), 0.6) + rng.normal(0, 2.0, img.shape), 0, 255).astype(np.uint8)
                yuv = cv2.cvtColor(fr, cv2.COLOR_BGR2YUV_I420)
                fh.write(b'FRAME\n'); fh.write(yuv.tobytes())
                n_frames += 1
            if name == 'level':
                cv2.imwrite(out.replace('.y4m', '_level.png'), fr)
            if name.startswith('towards'):
                cv2.imwrite(out.replace('.y4m', '_tilt.png'), fr)
    json.dump({'card': card, 'K': {'fx': f, 'fy': f, 'cx': W / 2, 'cy': H / 2}, 'W': W, 'H': H, 'fov': math.degrees(2 * math.atan(max(W, H) / 2 / f)),
               'up_cam': up_cam.tolist(), 'fps': fps, 'frames': n_frames, 'segments': gt}, open(out.replace('.y4m', '.json'), 'w'), indent=1)
    print('wrote', n_frames, 'frames', W, 'x', H)


if __name__ == '__main__':
    main()
