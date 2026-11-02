import { describe, expect, it, vi } from "vitest";
import { Fail, aiWriter, failed, ownImage, text, viewer, writer } from "@/lib/guard";
import { newKey } from "@/lib/media";
import { uid } from "./factories";
import { putMedia, rateLimit, signIn } from "./helpers";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

describe("viewer", () => {
  it("returns the signed-in member and refuses everyone else", async () => {
    signIn("user_1");
    expect(await viewer()).toBe("user_1");
    signIn(null);
    await expect(viewer()).rejects.toThrow("Unauthorized");
  });
});

describe("writer", () => {
  it("rate-limits writes per member", async () => {
    signIn("user_1");
    const limit = rateLimit("WRITE_LIMIT");
    expect(await writer()).toBe("user_1");
    expect(limit).toHaveBeenCalledWith({ key: "user_1" });

    rateLimit("WRITE_LIMIT", false);
    await expect(writer()).rejects.toThrow(Fail);
  });

  it("puts AI calls behind both the write limit and a tighter AI limit", async () => {
    signIn("user_1");
    rateLimit("WRITE_LIMIT");
    rateLimit("AI_LIMIT", false);
    await expect(aiWriter()).rejects.toThrow("Too many AI requests");

    rateLimit("AI_LIMIT");
    expect(await aiWriter()).toBe("user_1");
  });
});

describe("failed", () => {
  it("shows a Fail's message and rethrows anything else, so internals never reach the user", () => {
    expect(failed(new Fail("Nope"))).toEqual({ error: "Nope" });
    expect(() => failed(new Error("SQL details"))).toThrow("SQL details");
  });
});

describe("text", () => {
  it("trims, caps and ignores non-strings", () => {
    expect(text("  hi  ", 10)).toBe("hi");
    expect(text("abcdef", 3)).toBe("abc");
    expect(text(42, 10)).toBe("");
  });
});

describe("ownImage", () => {
  it("accepts an image this member uploaded to the folder", async () => {
    const me = uid("user");
    const key = newKey("profiles", me, "png");
    await putMedia(key, me);
    expect(await ownImage(me, key, "profiles")).toBe(key);
  });

  it.each([
    ["someone else's upload", "other", "image/png"],
    ["a non-image file", "me", "application/pdf"],
  ])("rejects %s", async (_, ownerTag, type) => {
    const me = uid("user");
    const key = newKey("profiles", me, "png");
    await putMedia(key, ownerTag === "me" ? me : uid("user"), "x", type);
    await expect(ownImage(me, key, "profiles")).rejects.toThrow(Fail);
  });

  it("rejects keys outside the member's folder, missing objects and non-strings", async () => {
    const me = uid("user");
    const elsewhere = newKey("posts", me, "png");
    await putMedia(elsewhere, me);
    await expect(ownImage(me, elsewhere, "profiles")).rejects.toThrow(Fail);
    await expect(ownImage(me, newKey("profiles", me, "png"), "profiles")).rejects.toThrow(Fail);
    await expect(ownImage(me, { key: "x" }, "profiles")).rejects.toThrow(Fail);
  });
});
