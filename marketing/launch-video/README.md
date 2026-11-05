# Launch video

`launch.mp4`: 10 s, 1920x1080, 30 fps. The brief came from the `/blank-page` skill and is in [`prompt.md`](prompt.md).

`comp.html` is the whole animation as one deterministic `render(t)` function. It uses the landing page's sky images, the logo and the app's fonts (Newsreader, Geist).

```sh
node render.mjs              # renders launch.mp4 (needs playwright + ffmpeg)
node render.mjs 2.4 6.3      # stills at those seconds, into frames/
```
