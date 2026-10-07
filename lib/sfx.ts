// UI sounds synthesized with Web Audio — no files to download, no decode latency.
// Browsers only allow audio after a user gesture, so call a sound (or unlockSfx)
// synchronously inside the click handler, before any await.

let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export const unlockSfx = () => void audio();

// One sine "voice": quick attack, exponential decay, optional pitch glide.
function tone(a: AudioContext, at: number, from: number, to: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + Math.min(dur, 0.08));
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** Like: a single high glass "tink" (C7). ~300ms. */
export function playLike() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  tone(a, t, 2093, 2093, 0.3, 0.09);
  tone(a, t, 2093 * 2.76, 2093 * 2.76, 0.1, 0.02); // inharmonic partial = "glass"
}

/** Post: a two-note rising chime (A5 → E6), bell-like. ~500ms. */
export function playPost() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  for (const [i, f] of [880, 1318.5].entries()) {
    const at = t + i * 0.09;
    tone(a, at, f, f, 0.45, 0.13);
    tone(a, at, f * 2.76, f * 2.76, 0.18, 0.02); // inharmonic partial = "bell"
  }
}
