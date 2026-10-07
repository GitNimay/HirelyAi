// Run: node --experimental-strip-types lib/reactions.test.ts
import assert from "node:assert/strict";
import { isReaction, moveReaction, topReactions } from "./reactions.ts";

assert.deepEqual(moveReaction({}, null, "like"), { like: 1 });
assert.deepEqual(moveReaction({ like: 1 }, "like", null), {});
assert.deepEqual(moveReaction({ like: 2, love: 1 }, "like", "love"), { like: 1, love: 2 });
assert.deepEqual(moveReaction({ like: 1 }, "like", "like"), { like: 1 });
assert.deepEqual(moveReaction({}, "funny", null), {}); // stale client state never goes negative

assert.deepEqual(topReactions({ like: 1, love: 5, funny: 3, celebrate: 2 }), ["love", "funny", "celebrate"]);
assert.ok(isReaction("insightful"));
assert.ok(!isReaction("$.x"));

console.log("reactions ok");
