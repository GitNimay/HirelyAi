import assert from "node:assert/strict";
import { avgMs, lastDays, state, tone, totals, uptime } from "./status-fields.ts";

assert.equal(tone(undefined), "none");
assert.equal(tone({ day: "", total: 96, failed: 0, ms: 0, ms_count: 0 }), "up");
assert.equal(tone({ day: "", total: 96, failed: 2, ms: 0, ms_count: 0 }), "degraded");
assert.equal(tone({ day: "", total: 96, failed: 40, ms: 0, ms_count: 0 }), "down");
assert.equal(uptime([]), null);
assert.equal(uptime([{ day: "", total: 10000, failed: 0, ms: 0, ms_count: 0 }]), "100%");
assert.equal(uptime([{ day: "", total: 100000, failed: 4, ms: 0, ms_count: 0 }]), "99.99%");

// totals sums every field across a window (works per component or across components)
assert.deepEqual(totals([]), { total: 0, failed: 0, ms: 0, ms_count: 0 });
assert.deepEqual(
  totals([
    { day: "", total: 96, failed: 1, ms: 100, ms_count: 95 },
    { day: "", total: 96, failed: 0, ms: 202, ms_count: 96 },
  ]),
  { total: 192, failed: 1, ms: 302, ms_count: 191 },
);

// average latency comes from a day's successful checks only
assert.equal(avgMs({ day: "", total: 3, failed: 1, ms: 301, ms_count: 2 }), 151);
assert.equal(avgMs({ day: "", total: 96, failed: 0, ms: 0, ms_count: 0 }), undefined);
assert.equal(avgMs(undefined), undefined);

// current state: the probe's result wins, then any failure recorded today
assert.equal(state(false), "down");
assert.equal(state(false, { day: "", total: 1, failed: 0, ms: 0, ms_count: 0 }), "down");
assert.equal(state(true, { day: "", total: 1, failed: 1, ms: 0, ms_count: 0 }), "degraded");
assert.equal(state(true), "up");
assert.equal(state(true, { day: "", total: 1, failed: 0, ms: 0, ms_count: 0 }), "up");

const d = lastDays(Date.UTC(2026, 9, 10, 12));
assert.equal(d.length, 90);
assert.equal(d.at(-1), "2026-10-10");
assert.equal(d[0], "2026-07-13");
console.log("status-fields ok");
