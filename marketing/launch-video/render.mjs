// Renders comp.html frame by frame into launch.mp4.
// usage: node render.mjs            -> full 10s video at 30fps
//        node render.mjs 0.5 2.3 …  -> stills at those times (frames/still-<t>.png)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, DURATION = 10;
const stills = process.argv.slice(2).map(Number);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(dir, 'comp.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

if (stills.length) {
  for (const t of stills) {
    await page.evaluate(t => window.render(t), t);
    await page.screenshot({ path: path.join(dir, 'frames', `still-${t}.png`) });
  }
} else {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart',
    path.join(dir, 'launch.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < FPS * DURATION; f++) {
    await page.evaluate(t => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
}
await browser.close();
