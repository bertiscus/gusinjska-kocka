# Gusinjska kocka

A tilt-maze game on a six-sided cube. Tilt the cube, roll the ball through a maze that wraps around all six faces, and visit the buildings of Gusinje by rolling the ball to their doors. Part of Xplore Prokletije.

**Languages:** Montenegrin, Albanian and English (switch on the start screen; picked from the phone's language the first time).

**Levels:** 1 Kula, 2 Izvori, 3 Cijela kocka, 4 Bogomolje, 5 Gusinje (all nine buildings).

**AR:** on the start screen, tap **Igraj s AR kockom / Luaj me kubin AR / Play with the AR cube** and point the phone's camera at the printed AR cube (the 70 mm cube from `wave84mn/ar-cube`, or the paper one in `ar/AR_cube_paper_test.pdf`). The game cube is drawn onto the real cube; tilt the real cube and the ball rolls downhill. The flat card (page 1 of the PDF) works too: the game cube stands on it. AR needs the camera, so it works from the GitHub Pages site in Chrome (Android) or Safari (iPhone), not inside the Claude preview.

**Zoom:** the + / − buttons on the right side step through 0.5×, 0.75×, 1×, 1.5× and 2×; pinching with two fingers zooms smoothly (keyboard: + and −). Touch play and AR remember their own zoom.

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
| `src/sound.js` | All sound effects, made in the browser (no audio files): chimes in one pentatonic key, rolling, knocks, splash, wind and birds |
| `src/main.js` | Scene, model loading, controls, menus, all game text (ME / SQ / EN) |
| `src/page.html` | Page layout and styles |
| `src/ar/session.js` | AR mode: camera, tracking loop, pose smoothing, "up" from the phone's tilt sensor |
| `src/ar/calib.js` | Learns the camera's field of view from the cube; judges pose accuracy relative to the cube's size |
| `src/ar/detector.js`, `pose.js`, `tracker.js` | Marker detector and pose solver, from `wave84mn/ar-cube` (contour code adapted from js-aruco, MIT, see `src/ar/LICENSE-js-aruco.txt`) |
| `ar/layout.json` | Marker layout of the printed cube and card (same file as in `ar-cube`) |
| `ar/AR_cube_paper_test.pdf` | Printable paper cube and flat card |
| `build.mjs` | Bundles `src/` into `index.html` (each module keeps its own scope) |
| `test/core.test.mjs` | Checks edge crossing, level maps, that the autopilot finishes every level, and a 400-second random-tilt test |
| `test/browser_test.py` | Plays every level in a phone-sized headless browser and takes screenshots |
| `test/ar_video.py`, `test/ar_test.py` | AR test: renders a fake camera video of the cube (or card) with known poses (`--fov`, `--dist` for narrow cameras), plays it as the browser's camera and checks pose, on-screen alignment, gravity and ball direction; `--auto` lets the game learn the field of view |

## Build and test

```
node build.mjs
node test/core.test.mjs
python3 test/browser_test.py   # needs Playwright with Chromium
```

## How AR mode works

1. The camera frame is searched for the cube's markers (2×2 per face). One pose is solved from every visible marker and smoothed.
2. "Down" comes from the phone's tilt sensor and is turned into the cube's own coordinates, so tilting the real cube tilts the maze. Without a tilt sensor the game assumes the phone is held upright.
3. The game cube is drawn with the camera's own projection, slightly larger than the real cube so its edges stay hidden.
4. A level starts when the face with the ball is level. When the cube leaves the camera view, the game waits.

Field of view: phones differ a lot. Some give the browser a wide picture, others a cropped, zoomed-in one (about 23° on one test phone). The game learns the camera's field of view from the cube itself: whenever two or more faces are visible it finds the value that makes the cube fit best, takes the median of recent estimates and remembers it on the phone (per camera resolution). It also asks the camera for its widest zoom where the phone allows it. `?fov=60` fixes the value and turns learning off; `?debug` shows tracking speed, markers found, the field of view in use and the camera mode.

Pose acceptance: a pose is shown when its error is small relative to the cube's size on screen (hand-made cubes are never perfect). When the cube is briefly lost (motion blur, a finger over a face), the game keeps the last position for 0.6 s before pausing.

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
| `A` | `sv-anton` | Crkva sv. Antona | 2 wide × 4 deep |
| `D` | `sv-djordje` | Crkva sv. Đorđa | 3 wide × 4 deep |

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
