import { describe, expect, it } from "vitest";
import { cleanRelease, parseNote } from "./changelog-fields";

describe("cleanRelease", () => {
  it("rejects junk and releases with no title or no usable change", () => {
    expect(cleanRelease(null)).toBeNull();
    expect(cleanRelease({ title: "X", changes: [] })).toBeNull();
    expect(cleanRelease({ title: "", changes: [{ type: "new", text: "a" }] })).toBeNull();
  });

  it("passes a skip through", () => {
    expect(cleanRelease({ skip: true })).toEqual({ skip: true });
  });

  it("trims text, joins lines and drops unknown change types", () => {
    expect(
      cleanRelease({
        title: "  Reactions ",
        changes: [{ type: "new", text: " React\n to posts " }, { type: "removed", text: "x" }, { type: "fixed" }],
      }),
    ).toEqual({ skip: false, title: "Reactions", changes: [["new", "React to posts"]] });
  });

  it("keeps at most four changes", () => {
    const r = cleanRelease({ title: "t", changes: Array(9).fill({ type: "fixed", text: "y" }) });
    expect((r as { changes: unknown[] }).changes).toHaveLength(4);
  });
});

describe("parseNote", () => {
  it("returns null without a release-note block", () => {
    expect(parseNote("Title: Fix\n\nno block here")).toBeNull();
  });

  it("reads NONE as a skip", () => {
    expect(parseNote("Title: x\n\n```release-note\nNONE\n```")).toEqual({ skip: true });
  });

  it("reads the title and typed lines, case-insensitively, ignoring other lines", () => {
    expect(
      parseNote(
        "Title: Add reactions (#59)\n\n```release-note\nTitle: Reactions\nNew: React to posts.\nfixed: Likes count correctly.\nrandom line\n```",
      ),
    ).toEqual({
      skip: false,
      title: "Reactions",
      changes: [
        ["new", "React to posts."],
        ["fixed", "Likes count correctly."],
      ],
    });
  });

  it("falls back to the PR title when the block has none", () => {
    expect(parseNote("Title: Post button\n\n```release-note\nNew: Post from any page.\n```")).toEqual({
      skip: false,
      title: "Post button",
      changes: [["new", "Post from any page."]],
    });
  });
});
