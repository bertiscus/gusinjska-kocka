import sys, glob, os
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from meshio import load_obj, load_texture, sample_texture, render_views
d, out, up = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else 'y')
obj = glob.glob(os.path.join(d, 'x', '*.obj'))[0]
tex = [f for f in glob.glob(os.path.join(d, 'x', '*')) if f.lower().endswith(('.jpg', '.png')) and 'unwrap' not in f][0]
V, VT, F, FT = load_obj(obj)
img = load_texture(tex)
uvc = VT[FT].mean(1)
rgb = sample_texture(img, uvc)
if up == 'z':   # Z up -> Y up
    V = np.stack([V[:, 0], V[:, 2], -V[:, 1]], 1)
elif up == '-z':
    V = np.stack([V[:, 0], -V[:, 2], V[:, 1]], 1)
render_views(V, F, rgb, out, size=300, title=os.path.basename(d.rstrip('/')) + f'  (up={up})')
print('ok', out)
