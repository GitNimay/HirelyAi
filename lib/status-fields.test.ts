import { describe, expect, it } from "vitest";
import { avgMs, lastDays, state, tone, totals, uptime, type Day } from "./status-fields";

const day = (total: number, failed = 0, ms = 0, ms_count = 0): Day => ({ day: "", total, failed, ms, ms_count });

describe("tone", () => {
  it.each([
    [undefined, "none"],
    [day(96), "up"],
    [day(96, 2), "degraded"],
    [day(96, 40), "down"],
  ])("colours %j as %s", (d, expected) => {
    expect(tone(d)).toBe(expected);
  });
});

describe("uptime", () => {
  it("is null without data and rounds to two decimals", () => {
    expect(uptime([])).toBeNull();
    expect(uptime([day(10000)])).toBe("100%");
    expect(uptime([day(100000, 4)])).toBe("99.99%");
  });
});

describe("totals", () => {
  it("sums every field across days", () => {
    expect(totals([])).toEqual({ total: 0, failed: 0, ms: 0, ms_count: 0 });
    expect(totals([day(96, 1, 100, 95), day(96, 0, 202, 96)])).toEqual({
      total: 192,
      failed: 1,
      ms: 302,
      ms_count: 191,
    });
  });
});

describe("avgMs", () => {
  it("averages only successful checks", () => {
    expect(avgMs(day(3, 1, 301, 2))).toBe(151);
    expect(avgMs(day(96))).toBeUndefined();
    expect(avgMs(undefined)).toBeUndefined();
  });
});

describe("state", () => {
  it("lets the live probe win, then any failure recorded today", () => {
    expect(state(false)).toBe("down");
    expect(state(false, day(1))).toBe("down");
    expect(state(true, day(1, 1))).toBe("degraded");
    expect(state(true)).toBe("up");
    expect(state(true, day(1))).toBe("up");
  });
});

describe("lastDays", () => {
  it("returns 90 UTC days ending today", () => {
    const d = lastDays(Date.UTC(2026, 9, 10, 12));
    expect(d).toHaveLength(90);
    expect(d.at(-1)).toBe("2026-10-10");
    expect(d[0]).toBe("2026-07-13");
  });
});
