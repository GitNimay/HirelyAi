import { describe, expect, it } from "vitest";
import { cleanHandle, maskEmail, maskPhone, normalizeWebsite, shortUrl, slugify, validHandle } from "./profile-fields";

describe("slugify", () => {
  it.each([
    ["Nimesh Kulkarni", "nimesh-kulkarni"],
    ["  José  Álvarez! ", "jose-alvarez"],
    ["李雷", "member"],
    ["Al", "al-member"],
  ])("turns %j into %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("always produces a valid handle, even from a very long name", () => {
    expect(validHandle(slugify("A".repeat(80)))).toBe(true);
  });
});

describe("handles", () => {
  it("cleans @, case and spaces", () => {
    expect(cleanHandle("  @Ada-L ")).toBe("ada-l");
  });

  it.each(["ada-lovelace", "a1b"])("accepts %j", (handle) => {
    expect(validHandle(handle)).toBe(true);
  });

  it.each(["ab", "-ada", "ada-", "ada--l", "Ada", "ada_l", "a".repeat(31), "ada.l"])("rejects %j", (handle) => {
    expect(validHandle(handle)).toBe(false);
  });
});

describe("websites", () => {
  it("adds https and keeps the path", () => {
    expect(normalizeWebsite("example.com/me")).toBe("https://example.com/me");
    expect(shortUrl("https://example.com/")).toBe("example.com");
  });

  it("treats blank as cleared", () => {
    expect(normalizeWebsite("  ")).toBeNull();
  });

  it.each(["javascript:alert(1)", "ftp://example.com", "localhost", "not a url"])("rejects %j", (bad) => {
    expect(normalizeWebsite(bad)).toBeUndefined();
  });
});

describe("masking", () => {
  it("hides most of an email but keeps it recognisable", () => {
    expect(maskEmail("nimesh.kulkarni@gmail.com")).toBe("nimesh.k*******@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a@b.co");
    expect(maskEmail("")).toBe("");
  });

  it("hides the end of a phone number", () => {
    expect(maskPhone("+91 98765 43210")).toBe("+91 9876* *****");
    expect(maskPhone("")).toBe("");
  });
});
