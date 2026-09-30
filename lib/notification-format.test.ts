// Run: node --experimental-strip-types lib/notification-format.test.ts
import assert from "node:assert/strict";
import { categoryOf, verb, who } from "./notification-format.ts";

const n = (...names: string[]) => names.map((name) => ({ name }));

assert.equal(who([], 0), "Someone");
assert.equal(who(n("Ada"), 1), "Ada");
assert.equal(who(n("Bo", "Ada"), 2), "Bo and Ada");
assert.equal(who(n("Cy", "Bo", "Ada"), 3), "Cy, Bo and 1 other");
assert.equal(who(n("Cy", "Bo", "Ada"), 12), "Cy, Bo and 10 others");

assert.equal(verb("applicant", "Designer"), "applied to Designer");
assert.equal(verb("like", null), "liked your post");

assert.equal(categoryOf("like"), "posts");
assert.equal(categoryOf("invite"), "network");
assert.equal(categoryOf("app_rejected"), "jobs");
assert.equal(categoryOf("job_closed"), "jobs");

console.log("notification-format ok");
