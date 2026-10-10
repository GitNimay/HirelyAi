import assert from "node:assert/strict";
import { lastDays, tone, uptime } from "./status-fields.ts";

assert.equal(tone(undefined), "none");
assert.equal(tone({ day: "", total: 96, failed: 0 }), "up");
assert.equal(tone({ day: "", total: 96, failed: 2 }), "degraded");
assert.equal(tone({ day: "", total: 96, failed: 40 }), "down");
assert.equal(uptime([]), null);
assert.equal(uptime([{ day: "", total: 10000, failed: 0 }]), "100%");
assert.equal(uptime([{ day: "", total: 100000, failed: 4 }]), "99.99%");
const d = lastDays(Date.UTC(2026, 9, 10, 12));
assert.equal(d.length, 90);
assert.equal(d.at(-1), "2026-10-10");
assert.equal(d[0], "2026-07-13");
console.log("status-fields ok");
