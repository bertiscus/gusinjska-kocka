# Showcase video (vertical, 32 s)

How `gusinjska-kocka-showcase.mp4` (1080 x 1920, 30 fps) was made. Paths in the scripts point at the
working folder used then (`/home/claude/gk-video`); change them before running elsewhere.

1. `camscene.py`: draws the fake phone-camera frames for the AR shot: the printed marker cube
   (real `ar/layout.json` markers) held above a wooden table.
2. `capture.py level1 spin level5 lang ar`: films the real game frame by frame in headless Chromium.
   A virtual clock steps the game exactly 1/30 s per frame; for AR the camera is a canvas stream fed
   with the frames from step 1, and each step waits until the tracker has seen the new frame.
3. `music.py`: original music bed (D major pentatonic, 100 BPM), synced to `timeline.json`.
4. `render.py stills ...` / `render.py scenes` / `render.py final`: `director.html` lays out the
   titles, phone mockup and transitions; every frame is drawn in Chromium, each scene encoded on
   its own, then joined and the music added (loudness -16 LUFS).

Scenes: Xplore Prokletije logo, title over the spinning cube, level 1 with a building fact,
level 5, AR on the printed cube, the three languages, end card with QR code and link.
