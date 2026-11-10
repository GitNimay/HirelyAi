// Renders index.html to PNG frames, in parallel pages.
//   node render.mjs <outDir> [fps=60] [workers=4]          full film
//   node render.mjs <outDir> --stills 1.5,9.5,14            a few stills, to check a change
// Also writes <outDir>/sfx.json (the sound-effect cue sheet music.py reads).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // resolves a global install too
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const [out, a, b] = process.argv.slice(2);
if (!out) throw new Error("usage: node render.mjs <outDir> [fps] [workers] | --stills t1,t2");
mkdirSync(out, { recursive: true });
const url = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.html")).href;
const browser = await chromium.launch();
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
};

if (a === "--stills") {
  const page = await open();
  for (const t of b.split(",").map(Number)) {
    await page.evaluate((t) => window.seek(t), t);
    await page.screenshot({ path: path.join(out, `still_${t.toFixed(2).padStart(5, "0")}.png`) });
  }
} else {
  const fps = Number(a) || 60, workers = Number(b) || 4, total = 60 * fps;
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      const page = await open();
      if (w === 0) writeFileSync(path.join(out, "sfx.json"), JSON.stringify(await page.evaluate(() => window.SFX)));
      for (let f; (f = next++) < total; ) {
        await page.evaluate((t) => window.seek(t), f / fps);
        await page.screenshot({ path: path.join(out, `f_${String(f).padStart(5, "0")}.png`) });
        if (f % 300 === 0) console.log(`frame ${f}/${total}`);
      }
    }),
  );
}
await browser.close();
