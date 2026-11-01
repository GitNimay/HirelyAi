import { history, liveStatus } from "@/lib/status";
import { COMPONENTS, MONITORS, state, uptime } from "@/lib/status-fields";

/**
 * Machine-readable status for monitors and integrations (strictly the page's data, minus presentation).
 * The top-level `status` follows the common statuspage vocabulary (`none` < `minor` < `major`);
 * per-component `status` is the page's own `up` / `degraded` / `down` figure.
 * Same 60 s live cache as the page, so polling here costs as much as a page view.
 */
export async function GET() {
  const [live, past] = await Promise.all([liveStatus(), history()]);
  const down = COMPONENTS.filter(({ id }) => !live.up[id]);
  return Response.json(
    {
      status: {
        indicator: down.length === COMPONENTS.length ? "major" : down.length ? "minor" : "none",
        description:
          down.length === COMPONENTS.length
            ? "Major System Outage"
            : down.length
              ? "Partial System Outage"
              : "All Systems Operational",
      },
      components: COMPONENTS.map(({ id, name }) => ({
        id,
        name,
        description: MONITORS[id],
        status: state(live.up[id], past[id].at(-1)), // "up" | "degraded" | "down"
        response_ms: live.ms?.[id],
        uptime_last_90d: uptime(past[id]),
        checked_at: new Date(live.at).toISOString(),
      })),
      generated_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "max-age=60" } },
  );
}
