"""Quick stats for OBJ scans: counts, bounding box, texture size, header comments."""
import sys, os, glob
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

def load_obj(path):
    vs, vts, fv, ft = [], [], [], []
    comments = []
    with open(path, 'r', errors='replace') as fh:
        for line in fh:
            if line.startswith('v '):
                p = line.split(); vs.append((float(p[1]), float(p[2]), float(p[3])))
            elif line.startswith('vt '):
                p = line.split(); vts.append((float(p[1]), float(p[2])))
            elif line.startswith('f '):
                p = line.split()[1:]
                idx = [q.split('/') for q in p]
                vv = [int(a[0]) for a in idx]
                tt = [int(a[1]) if len(a) > 1 and a[1] else 0 for a in idx]
                for k in range(1, len(vv) - 1):
                    fv.append((vv[0], vv[k], vv[k + 1])); ft.append((tt[0], tt[k], tt[k + 1]))
            elif line.startswith('#') and len(comments) < 8:
                comments.append(line.strip())
    V = np.array(vs, np.float64); VT = np.array(vts, np.float64) if vts else np.zeros((0, 2))
    F = np.array(fv, np.int64); FT = np.array(ft, np.int64)
    F = np.where(F < 0, F + len(V) + 1, F) - 1
    FT = np.where(FT < 0, FT + len(VT) + 1, FT) - 1
    return V, VT, F, FT, comments

if __name__ == '__main__':
    for d in sys.argv[1:]:
        objs = glob.glob(os.path.join(d, 'x', '*.obj'))
        imgs = [f for f in glob.glob(os.path.join(d, 'x', '*')) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        for o in objs:
            V, VT, F, FT, com = load_obj(o)
            lo, hi = V.min(0), V.max(0)
            print(f'== {os.path.basename(d)}')
            print('  comments:', ' | '.join(c for c in com if len(c) > 2)[:200])
            print(f'  verts {len(V)}  uvs {len(VT)}  tris {len(F)}')
            print('  bbox min', np.round(lo, 3), 'max', np.round(hi, 3), 'size', np.round(hi - lo, 3))
            # area-weighted normal histogram: which axis looks like "up" (big flat floor/roof areas)
            a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
            n = np.cross(b - a, c - a); area = np.linalg.norm(n, axis=1) / 2
            n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            for ax, name in enumerate('XYZ'):
                print(f'   area facing +{name}: {area[n[:, ax] > 0.85].sum():9.3f}   -{name}: {area[n[:, ax] < -0.85].sum():9.3f}')
            print('  total area', round(area.sum(), 3))
        for im in imgs:
            with Image.open(im) as I:
                print('  texture', os.path.basename(im), I.size, I.mode)
