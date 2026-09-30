import assert from "node:assert/strict";
import { cleanFilters } from "./job-fields.ts";

// Unknown values and prototype keys are dropped; strings are trimmed and capped
assert.deepEqual(cleanFilters({ q: "  react ", workplace: "remote", type: "toString", level: "ceo", posted: "week", loc: "   " }), {
  q: "react", loc: undefined, workplace: "remote", type: undefined, level: undefined, posted: "week",
});
assert.equal(cleanFilters({ q: "x".repeat(500) }).q?.length, 100);
assert.deepEqual(Object.values(cleanFilters({ q: ["a"], workplace: 1 })).filter(Boolean), []);
console.log("job-fields: ok");
