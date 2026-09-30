import assert from "node:assert/strict";
import { inFolder, keyOwner, newKey } from "./media.ts";

const k = newKey("profiles", "user_1", "jpg");
assert.match(k, /^profiles\/user_1\/[0-9a-f-]{36}\.jpg$/);
assert.equal(keyOwner(k), "user_1");
assert.ok(inFolder(k, "profiles", "user_1"));
// Folders don't leak into each other, and nobody else's files qualify
assert.ok(!inFolder(k, "posts", "user_1"));
assert.ok(!inFolder(newKey("posts", "user_1", "png"), "posts", "user_2"));
assert.ok(!inFolder("posts/user_1x/a.png", "posts", "user_1"));
// Pre-folder keys: still usable as post media / resumes, never as profile images
assert.ok(inFolder("user_1/a.png", "posts", "user_1") && inFolder("user_1/a.pdf", "resumes", "user_1"));
assert.ok(!inFolder("user_1/a.png", "profiles", "user_1") && !inFolder("user_1/pf-a.jpg", "posts", "user_1"));
assert.equal(keyOwner("user_1/a.pdf"), "user_1");
console.log("media: ok");
