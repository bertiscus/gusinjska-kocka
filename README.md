# Gusinjska kocka

A tilt-maze game on a six-sided cube. Tilt the cube, roll the ball through a maze that wraps around all six faces, and visit the buildings of Gusinje by rolling the ball to their doors. Part of Xplore Prokletije.

**Play:** open `index.html` (or the GitHub Pages site for this repo) on a phone and drag across the screen to tilt the cube.

The buildings are stand-in models for now: Kula Rašića, Sebilj, Stara kuća and Vodenica. They will be replaced with our own 3D models.

## Files

| Path | What it is |
|---|---|
| `index.html` | The built game: one self-contained file, no outside libraries |
| `src/core.js` | Levels, ball physics, crossing between faces, game rules, autopilot |
| `src/render.js` | Small WebGL renderer and mesh builder |
| `src/main.js` | Scene, stand-in building models, controls, menus, sound, ME/EN text |
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
| `K` `J` `H` `M` | Building footprint: Kula, Sebilj, Stara kuća, Vodenica (a filled rectangle) |
| `k` `j` `h` `m` | That building's door, touching its footprint |

A gap in the rim (`.` on the edge row or column) is a gate to the next face. The matching tile on the other face must also be open. `node test/core.test.mjs` reports gates, catches map mistakes and checks that every door can be reached.

Face orientation, as a cube net:

```
          top
left    front    right
         bottom
          back
```

On `top`, row 0 is the back edge and the last row is the front edge. On `front`, `left` and `right`, row 0 is the top edge.
