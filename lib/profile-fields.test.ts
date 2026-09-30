import assert from "node:assert/strict";
import { cleanHandle, normalizeWebsite, shortUrl, slugify, validHandle } from "./profile-fields.ts";

assert.equal(slugify("Nimesh Kulkarni"), "nimesh-kulkarni");
assert.equal(slugify("  José  Álvarez! "), "jose-alvarez");
assert.equal(slugify("李雷"), "member");
assert.equal(slugify("Al"), "al-member");
assert.ok(validHandle(slugify("A".repeat(80))));

assert.equal(cleanHandle("  @Ada-L "), "ada-l");
assert.ok(validHandle("ada-lovelace") && validHandle("a1b"));
for (const bad of ["ab", "-ada", "ada-", "ada--l", "Ada", "ada_l", "a".repeat(31), "ada.l"]) assert.ok(!validHandle(bad), bad);

// Only real web addresses survive; javascript: and friends are rejected
assert.equal(normalizeWebsite("example.com/me"), "https://example.com/me");
assert.equal(normalizeWebsite("  "), null);
for (const bad of ["javascript:alert(1)", "ftp://example.com", "localhost", "not a url"]) assert.equal(normalizeWebsite(bad), undefined, bad);
assert.equal(shortUrl("https://example.com/"), "example.com");
console.log("profile-fields: ok");
