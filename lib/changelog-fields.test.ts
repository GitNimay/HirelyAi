import assert from "node:assert/strict";
import { cleanRelease } from "./changelog-fields.ts";

assert.equal(cleanRelease(null), null);
assert.deepEqual(cleanRelease({ skip: true }), { skip: true });
assert.equal(cleanRelease({ title: "X", changes: [] }), null);
assert.equal(cleanRelease({ title: "", changes: [{ type: "new", text: "a" }] }), null);
assert.deepEqual(
  cleanRelease({ title: "  Reactions ", changes: [{ type: "new", text: " React\n to posts " }, { type: "removed", text: "x" }, { type: "fixed" }] }),
  { skip: false, title: "Reactions", changes: [["new", "React to posts"]] },
);
assert.equal((cleanRelease({ title: "t", changes: Array(9).fill({ type: "fixed", text: "y" }) }) as { changes: unknown[] }).changes.length, 4);
console.log("changelog-fields ok");

import { parseNote } from "./changelog-fields.ts";
assert.equal(parseNote("Title: Fix\n\nno block here"), null);
assert.deepEqual(parseNote("Title: x\n\n```release-note\nNONE\n```"), { skip: true });
assert.deepEqual(
  parseNote("Title: Add reactions (#59)\n\n```release-note\nTitle: Reactions\nNew: React to posts.\nfixed: Likes count correctly.\nrandom line\n```"),
  { skip: false, title: "Reactions", changes: [["new", "React to posts."], ["fixed", "Likes count correctly."]] },
);
assert.deepEqual(parseNote("Title: Post button\n\n```release-note\nNew: Post from any page.\n```"), { skip: false, title: "Post button", changes: [["new", "Post from any page."]] });
console.log("parseNote ok");
