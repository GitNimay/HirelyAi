// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCtx } from "./stories";

// Fake timers: createCtx's pausable `wait` arms a window.setTimeout and reads performance.now,
// both of which the fake clock drives (advanceTimersByTimeAsync moves them together).
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const slide = () => document.createElement("div");

describe("createCtx", () => {
  describe("instant (reduced motion)", () => {
    it("jumps animations to their final state", async () => {
      const ctx = createCtx(slide(), true);
      const el = document.createElement("div");
      await ctx.to(el, { opacity: [0, 1], transform: ["scale(0)", "scale(1)"] });
      expect(el.style.opacity).toBe("1");
      expect(el.style.transform).toBe("scale(1)");
    });

    it("resolves waits immediately", async () => {
      const ctx = createCtx(slide(), true);
      await ctx.wait(60); // would hang a real minute on a fake clock
      ctx.cancel(); // just to prove nothing is left running
    });
  });

  describe("wait", () => {
    it("resolves once the time is up", async () => {
      const ctx = createCtx(slide(), false);
      let done = false;
      const p = ctx.wait(1).then(() => (done = true));
      await vi.advanceTimersByTimeAsync(999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await p;
    });

    it("pauses the countdown and resumes with the time it had left", async () => {
      const ctx = createCtx(slide(), false);
      let done = false;
      const p = ctx.wait(1).then(() => (done = true));
      ctx.pause();
      await vi.advanceTimersByTimeAsync(5000); // far past the wait: paused, so nothing fires
      expect(done).toBe(false);
      ctx.resume();
      await vi.advanceTimersByTimeAsync(1000); // exactly the remaining time: fires
      await p;
    });
  });

  describe("cancel", () => {
    it("stops the timer and nothing resolves afterwards", async () => {
      const ctx = createCtx(slide(), false);
      const p = ctx.wait(1);
      ctx.cancel();
      expect(ctx.alive).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      let resolved = false;
      void p.then(() => (resolved = true));
      await Promise.resolve();
      expect(resolved).toBe(false);
    });

    it("makes later animations never resolve", async () => {
      const ctx = createCtx(slide(), false);
      ctx.cancel();
      const p = ctx.to(document.createElement("div"), { opacity: 1 });
      let resolved = false;
      void p.then(() => (resolved = true));
      await vi.advanceTimersByTimeAsync(5000);
      expect(resolved).toBe(false);
    });
  });
});
