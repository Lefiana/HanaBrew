import { describe, expect, it } from "vitest";
import {
  BOTTOM_INSET,
  cascadePosition,
  clampPosition,
  clampSize,
  fitRect,
  getWorkArea,
  MIN_VISIBLE_WIDTH,
  MIN_WINDOW_SIZE,
  resizeRect,
  TITLEBAR_HEIGHT,
  TOP_INSET,
} from "./window-math";

const viewport = { width: 1200, height: 800 };
const work = getWorkArea(viewport);

describe("work area", () => {
  it("excludes the top bar and the dock", () => {
    expect(work).toEqual({
      x: 0,
      y: TOP_INSET,
      width: 1200,
      height: 800 - TOP_INSET - BOTTOM_INSET,
    });
  });
  it("never has negative height on tiny viewports", () => {
    expect(getWorkArea({ width: 300, height: 50 }).height).toBe(0);
  });
});

describe("clampPosition", () => {
  const size = { width: 600, height: 400 };
  it("keeps the title bar below the top bar", () => {
    expect(clampPosition({ x: 100, y: -500 }, size, work).y).toBe(TOP_INSET);
  });
  it("keeps the title bar above the dock", () => {
    expect(clampPosition({ x: 100, y: 5000 }, size, work).y).toBe(
      work.y + work.height - TITLEBAR_HEIGHT,
    );
  });
  it("leaves a grabbable strip on both horizontal edges", () => {
    expect(clampPosition({ x: -9999, y: 100 }, size, work).x).toBe(
      -(size.width - MIN_VISIBLE_WIDTH),
    );
    expect(clampPosition({ x: 9999, y: 100 }, size, work).x).toBe(work.width - MIN_VISIBLE_WIDTH);
  });
  it("does not move a window that is already well placed", () => {
    expect(clampPosition({ x: 200, y: 120 }, size, work)).toEqual({ x: 200, y: 120 });
  });
});

describe("clampSize / fitRect", () => {
  it("enforces the minimum size", () => {
    expect(clampSize({ width: 10, height: 10 }, work)).toEqual(MIN_WINDOW_SIZE);
  });
  it("shrinks a window that is bigger than the work area", () => {
    const fitted = fitRect({ x: 0, y: 0, width: 5000, height: 5000 }, work);
    expect(fitted.width).toBe(work.width);
    expect(fitted.height).toBe(work.height);
    expect(fitted.y).toBe(work.y);
  });
  it("does not demand more than a tiny work area can give", () => {
    const tiny = getWorkArea({ width: 260, height: 200 });
    const size = clampSize({ width: 800, height: 800 }, tiny);
    expect(size.width).toBeLessThanOrEqual(tiny.width);
  });
});

describe("cascadePosition", () => {
  const size = { width: 700, height: 480 };
  it("offsets successive windows", () => {
    const a = cascadePosition(0, size, work);
    const b = cascadePosition(1, size, work);
    expect(b.x - a.x).toBeGreaterThan(0);
    expect(b.y - a.y).toBeGreaterThan(0);
  });
  it("always lands inside the work area", () => {
    for (let i = 0; i < 20; i++) {
      const p = cascadePosition(i, size, work);
      expect(p.y).toBeGreaterThanOrEqual(work.y);
      expect(p.y).toBeLessThanOrEqual(work.y + work.height);
    }
  });
});

describe("resizeRect", () => {
  const start = { x: 200, y: 150, width: 600, height: 400 };
  it("grows from the south-east corner and keeps the north-west fixed", () => {
    expect(resizeRect(start, "se", 50, 30, work)).toEqual({
      x: 200,
      y: 150,
      width: 650,
      height: 430,
    });
  });
  it("shrinking from the west keeps the east edge fixed", () => {
    const r = resizeRect(start, "w", 100, 0, work);
    expect(r.x + r.width).toBe(800);
    expect(r.width).toBe(500);
  });
  it("shrinking from the north keeps the south edge fixed", () => {
    const r = resizeRect(start, "n", 0, 60, work);
    expect(r.y + r.height).toBe(550);
    expect(r.height).toBe(340);
  });
  it("stops at the minimum size", () => {
    const r = resizeRect(start, "se", -10_000, -10_000, work);
    expect(r.width).toBe(MIN_WINDOW_SIZE.width);
    expect(r.height).toBe(MIN_WINDOW_SIZE.height);
    const w = resizeRect(start, "w", 10_000, 0, work);
    expect(w.width).toBe(MIN_WINDOW_SIZE.width);
    expect(w.x + w.width).toBe(800);
  });
  it("cannot be dragged above the top bar or into the dock", () => {
    expect(resizeRect(start, "n", 0, -10_000, work).y).toBe(work.y);
    const s = resizeRect(start, "s", 0, 10_000, work);
    expect(s.y + s.height).toBe(work.y + work.height);
  });
  it("is derived from the start rect, so repeated calls do not drift", () => {
    expect(resizeRect(start, "e", 40, 0, work)).toEqual(resizeRect(start, "e", 40, 0, work));
  });
});
