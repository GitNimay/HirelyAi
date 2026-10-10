import { env } from "cloudflare:workers";
import { livekitToken } from "./interview";
import { COMPONENTS, lastDays, type ComponentId, type Day } from "./status-fields";

const ok = (res: Response) => res.ok;
const timeout = () => AbortSignal.timeout(5000);

// One cheap, read-only call per dependency. Anything thrown or slower than 5 s counts as down.
const PROBES: Record<ComponentId, () => Promise<boolean>> = {
  web: () => env.DB.prepare("SELECT 1").first().then(() => true),
  auth: () => fetch("https://api.clerk.com/v1/jwks", { headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` }, signal: timeout() }).then(ok),
  live: () => env.FEED_HUB.getByName("status").deliver([]).then(() => true),
  media: () => env.MEDIA.head("status-probe").then(() => true),
  ai: () => fetch(`${env.BEDROCK_BASE_URL}/models`, { headers: { Authorization: `Bearer ${env.BEDROCK_API_KEY}` }, signal: timeout() }).then(ok),
  voice: async () => {
    const auth = `Bearer ${await livekitToken({ video: { roomList: true } })}`;
    const res = await fetch(`${env.LIVEKIT_URL.replace(/^ws/, "http")}/twirp/livekit.RoomService/ListRooms`, {
      method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: "{}", signal: timeout(),
    });
    return res.ok;
  },
};

export type Live = { at: number; up: Record<ComponentId, boolean> };

/** Runs every probe and adds the results to today's counts. */
export async function checkAll(): Promise<Live> {
  const results = await Promise.all(COMPONENTS.map(({ id }) => PROBES[id]().catch(() => false)));
  const up = Object.fromEntries(COMPONENTS.map(({ id }, i) => [id, results[i]])) as Live["up"];
  const day = new Date().toISOString().slice(0, 10);
  const upsert = env.DB.prepare(
    "INSERT INTO status_checks (component, day, total, failed) VALUES (?, ?, 1, ?) ON CONFLICT (component, day) DO UPDATE SET total = total + 1, failed = failed + excluded.failed",
  );
  await env.DB.batch(COMPONENTS.map(({ id }) => upsert.bind(id, day, up[id] ? 0 : 1))).catch((e) => console.error("status record", e));
  return { at: Date.now(), up };
}

// Page views re-check at most once a minute per data center, so traffic can't turn into probe traffic
const LIVE_TTL = 60;
const liveKey = () => `${env.APP_URL}/__status`;

export async function liveStatus(): Promise<Live> {
  const cache = await caches.open("status");
  const hit = await cache.match(liveKey());
  if (hit) return hit.json();
  const live = await checkAll();
  await cache.put(liveKey(), Response.json(live, { headers: { "Cache-Control": `max-age=${LIVE_TTL}` } }));
  return live;
}

export async function history() {
  const days = lastDays();
  const { results } = await env.DB.prepare("SELECT component, day, total, failed FROM status_checks WHERE day >= ?").bind(days[0]).all<Day & { component: string }>();
  const by = new Map(results.map((r) => [`${r.component}:${r.day}`, r]));
  return Object.fromEntries(COMPONENTS.map(({ id }) => [id, days.map((day) => by.get(`${id}:${day}`) ?? { day, total: 0, failed: 0 })])) as Record<ComponentId, Day[]>;
}
