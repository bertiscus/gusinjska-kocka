# Gusinjska kocka

A tilt-maze game on a six-sided cube. Tilt the cube, roll the ball through a maze that wraps around all six faces, and visit the buildings of Gusinje by rolling the ball to their doors. Part of Xplore Prokletije.

**Play:** open `index.html` (or the GitHub Pages site for this repo) on a phone and drag across the screen to tilt the cube.

The buildings are our own 3D models, reduced to light game versions with their photo textures (see *Buildings* below).

## Files

| Path | What it is |
|---|---|
| `index.html` | The built game page (no outside libraries) |
| `models/` | Game versions of the buildings: `<id>.json` (mesh) and `<id>.jpg` (1024 px texture) |
| `tools/` | Turns a scanned OBJ + texture into a game model (`convert.py`, `decimate.mjs`, `models.json`) |
| `src/core.js` | Levels, ball physics, crossing between faces, game rules, autopilot |
| `src/render.js` | Small WebGL renderer and mesh builder |
| `src/main.js` | Scene, model loading, controls, menus, sound, ME/EN text |
| `src/page.html` | Page layout and styles |
| `build.mjs` | Bundles `src/` into `index.html` |
| `test/core.test.mjs` | Checks edge crossing, level maps, that the autopilot finishes every level, and a 400-second random-tilt test |
| `test/browser_test.py` | Plays every level in a phone-sized headless browser and takes screenshots |

## Build and test

```
node build.mjs
node test/core.test.mjs
python3 test/browser_test.py   # needs Playwright with Chromium
```

## Writing levels

Levels live in `LEVELS` in `src/core.js`. Each face is 9 rows of 9 characters. Faces a level leaves out get a closed, decorative layout.

| Character | Meaning |
|---|---|
| `#` | Stone wall. All four corners of every face must be `#` |
| `.` | Grass |
| `T` | Pine tree |
| `~` | Water: the ball goes back to the last visited door |
| `@` | Start (one per level) |
| Capital letter | Building footprint, a filled rectangle (letters in the table below) |
| Same letter, small | That building's door, touching its footprint |

A gap in the rim (`.` on the edge row or column) is a gate to the next face. The matching tile on the other face must also be open. `node test/core.test.mjs` reports gates, catches map mistakes and checks that every door can be reached.

Face orientation, as a cube net:

```
          top
left    front    right
         bottom
          back
```

On `top`, row 0 is the back edge and the last row is the front edge. On `front`, `left` and `right`, row 0 is the top edge.

## Buildings

| Letter | Model id | Name | Usual footprint |
|---|---|---|---|
| `K` | `kula-rasica` | Kula Rašića | 3×3 |
| `J` | `sebilj` | Sebilj | 2×2 |
| `N` | `kula-nekovica` | Kula Nekovića | 3×3 |
| `S` | `sahat-kula` | Sahat kula | 2×2 |
| `O` | `opstina` | Opština Gusinje | 3 wide × 2 deep |
| `C` | `cekica-dzamija` | Čekića džamija | 3×3 |
| `V` | `vezirova-dzamija` | Vezirova džamija | 3×3 |

Each model is scaled to fit its footprint (and at most 4 tiles tall), standing on the face with its front (+Z) towards the door tile.

## Adding a building

Needs Python 3 with numpy, scipy, opencv-python and Pillow, plus Node.

1. Put the scan (OBJ + its texture) in `scans/<folder>/`. Scans are not committed.
2. Add an entry to `tools/models.json`:
   - `obj`, `tex`: paths relative to `tools/`
   - `target`: triangles in the game version (8 000–12 000)
   - Only if the scan isn't already Y up with its front facing +Z: `up` (`"z"`), `level` (straighten a tilted scan), `yaw` (degrees, turns the front to +Z), `cut_below` (fraction of height to trim off ground), `trim_walls` (remove bits sticking out past the walls)
3. `python3 -I tools/convert.py tools/models.json <id> --out models`
4. Look at `tools/tmp/<id>/<id>_check.png` (scan vs game version, five views). Use `--preview-only` to check orientation first.
5. Give it a letter in `BUILDINGS` in `src/core.js`, use the letter in a level map, then `node build.mjs` and `node test/core.test.mjs`.
