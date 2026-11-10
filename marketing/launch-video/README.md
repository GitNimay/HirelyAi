# Launch video

`hirely-launch.mp4` is the 60-second product launch film (1920x1080, 60 fps, stereo).

The film is code. `index.html` is the whole animation: every frame is a function of time, so `window.seek(seconds)` poses
the page and a headless browser can screenshot it frame by frame. `music.py` synthesises the soundtrack, so there is no
sampled audio to license.

## Watch or edit

Open `index.html?play` in a browser to play it in real time (`?play=20` starts at 20 s). Scenes are the numbered blocks
in `build()`; all timings are in seconds.

## Render

Needs Node with Playwright, Python with numpy and scipy, and ffmpeg.

```sh
node render.mjs /tmp/frames 60 4              # 3600 PNG frames + sfx.json (sound-effect cues)
python3 music.py /tmp/frames/sfx.json /tmp/music.wav
ffmpeg -framerate 60 -i /tmp/frames/f_%05d.png -i /tmp/music.wav \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart hirely-launch.mp4
```

`node render.mjs /tmp/stills --stills 9.5,14,31` renders single frames, to check a change without a full render.
