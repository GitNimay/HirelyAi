import { describe, expect, it } from "vitest";
import { inFolder, keyOwner, newKey } from "./media";

describe("media keys", () => {
  it("are folder/owner/uuid.ext and remember their owner", () => {
    const k = newKey("profiles", "user_1", "jpg");
    expect(k).toMatch(/^profiles\/user_1\/[0-9a-f-]{36}\.jpg$/);
    expect(keyOwner(k)).toBe("user_1");
    expect(inFolder(k, "profiles", "user_1")).toBe(true);
  });

  it("never qualify for another folder or another member", () => {
    expect(inFolder(newKey("profiles", "user_1", "jpg"), "posts", "user_1")).toBe(false);
    expect(inFolder(newKey("posts", "user_1", "png"), "posts", "user_2")).toBe(false);
    expect(inFolder("posts/user_1x/a.png", "posts", "user_1")).toBe(false);
  });

  it("accept pre-folder keys as post media and resumes, never as profile images", () => {
    expect(inFolder("user_1/a.png", "posts", "user_1")).toBe(true);
    expect(inFolder("user_1/a.pdf", "resumes", "user_1")).toBe(true);
    expect(inFolder("user_1/a.png", "profiles", "user_1")).toBe(false);
    expect(inFolder("user_1/pf-a.jpg", "posts", "user_1")).toBe(false);
    expect(keyOwner("user_1/a.pdf")).toBe("user_1");
  });
});
