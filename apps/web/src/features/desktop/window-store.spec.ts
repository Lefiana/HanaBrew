import type { StateStorage } from "zustand/middleware";
import { beforeEach, describe, expect, it } from "vitest";
import { APPLICATIONS, getApplication } from "./app-registry";
import { createWindowStore, windowIdFor } from "./window-store";

const tasks = getApplication("tasks")!;
const calendar = getApplication("calendar")!;
const projects = getApplication("projects")!;

function memoryStorage(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

let storage: ReturnType<typeof memoryStorage>;
let store: ReturnType<typeof createWindowStore>;
const state = () => store.getState();

beforeEach(() => {
  storage = memoryStorage();
  store = createWindowStore(storage);
  state().setViewport({ width: 1280, height: 800 });
});

describe("opening and focus", () => {
  it("opens an app in a window and focuses it", () => {
    const id = state().openApp(tasks);
    expect(id).toBe(windowIdFor("tasks"));
    expect(state().windows[id]).toMatchObject({
      appId: "tasks",
      title: "HanaTasks",
      state: "normal",
    });
    expect(state().focusedId).toBe(id);
  });

  it("keeps one window per app: reopening focuses instead of duplicating", () => {
    const a = state().openApp(tasks);
    state().openApp(calendar);
    state().openApp(tasks);
    expect(Object.keys(state().windows)).toHaveLength(2);
    expect(state().focusedId).toBe(a);
  });

  it("gives the most recently focused window the highest z-index", () => {
    const a = state().openApp(tasks);
    const b = state().openApp(calendar);
    const c = state().openApp(projects);
    state().focusWindow(a);
    const z = (id: string) => state().windows[id]!.zIndex;
    expect(z(a)).toBeGreaterThan(z(c));
    expect(z(c)).toBeGreaterThan(z(b));
    expect(state().focusedId).toBe(a);
  });

  it("cascades new windows rather than stacking them exactly", () => {
    const a = state().openApp(tasks);
    const b = state().openApp(calendar);
    expect(state().windows[a]!.position).not.toEqual(state().windows[b]!.position);
  });
});

describe("minimize / restore", () => {
  it("minimizing hands focus to the next visible window", () => {
    const a = state().openApp(tasks);
    const b = state().openApp(calendar);
    state().minimizeWindow(b);
    expect(state().windows[b]!.state).toBe("minimized");
    expect(state().focusedId).toBe(a);
  });

  it("clears focus when the last visible window is minimized", () => {
    const a = state().openApp(tasks);
    state().minimizeWindow(a);
    expect(state().focusedId).toBeNull();
  });

  it("restoring brings the window back on top and focused", () => {
    const a = state().openApp(tasks);
    const b = state().openApp(calendar);
    state().minimizeWindow(a);
    state().restoreWindow(a);
    expect(state().windows[a]!.state).toBe("normal");
    expect(state().windows[a]!.zIndex).toBeGreaterThan(state().windows[b]!.zIndex);
    expect(state().focusedId).toBe(a);
  });

  it("opening a minimized app restores it", () => {
    const a = state().openApp(tasks);
    state().minimizeWindow(a);
    state().openApp(tasks);
    expect(state().windows[a]!.state).toBe("normal");
  });

  it("a maximized window is still maximized after minimize + restore", () => {
    const a = state().openApp(tasks);
    state().toggleMaximize(a);
    state().minimizeWindow(a);
    state().restoreWindow(a);
    expect(state().windows[a]!.state).toBe("maximized");
  });

  it("minimized windows cannot be focused or moved", () => {
    const a = state().openApp(tasks);
    state().minimizeWindow(a);
    const before = state().windows[a]!;
    state().focusWindow(a);
    state().moveWindow(a, { x: 5, y: 5 });
    expect(state().windows[a]).toEqual(before);
  });
});

describe("maximize", () => {
  it("toggles between normal and maximized without losing normal geometry", () => {
    const a = state().openApp(tasks);
    const { position, size } = state().windows[a]!;
    state().toggleMaximize(a);
    expect(state().windows[a]!.state).toBe("maximized");
    state().toggleMaximize(a);
    expect(state().windows[a]).toMatchObject({ state: "normal", position, size });
  });

  it("ignores move and resize while maximized", () => {
    const a = state().openApp(tasks);
    state().toggleMaximize(a);
    const before = state().windows[a]!;
    state().moveWindow(a, { x: 1, y: 1 });
    state().resizeWindow(a, { x: 1, y: 1, width: 400, height: 300 });
    expect(state().windows[a]).toEqual(before);
  });
});

describe("move / resize and viewport bounds", () => {
  it("clamps moves so the title bar stays reachable", () => {
    const a = state().openApp(tasks);
    state().moveWindow(a, { x: -99_999, y: -99_999 });
    const w = state().windows[a]!;
    expect(w.position.y).toBeGreaterThanOrEqual(40);
    expect(w.position.x + w.size.width).toBeGreaterThanOrEqual(120);
  });

  it("enforces the minimum size on resize", () => {
    const a = state().openApp(tasks);
    state().resizeWindow(a, { x: 100, y: 100, width: 10, height: 10 });
    expect(state().windows[a]!.size).toEqual({ width: 320, height: 220 });
  });

  it("pulls windows back into view when the viewport shrinks", () => {
    const a = state().openApp(calendar);
    state().moveWindow(a, { x: 900, y: 400 });
    state().setViewport({ width: 700, height: 500 });
    const w = state().windows[a]!;
    expect(w.position.x).toBeLessThanOrEqual(700 - 120);
    expect(w.position.y).toBeLessThanOrEqual(500 - 88 - 40);
    expect(w.size.width).toBeLessThanOrEqual(700);
  });
});

describe("closing", () => {
  it("removes the window and focuses the next visible one", () => {
    const a = state().openApp(tasks);
    const b = state().openApp(calendar);
    state().closeWindow(b);
    expect(state().windows[b]).toBeUndefined();
    expect(state().focusedId).toBe(a);
  });

  it("closing a background window keeps focus where it was", () => {
    const a = state().openApp(tasks);
    const b = state().openApp(calendar);
    state().closeWindow(a);
    expect(state().focusedId).toBe(b);
  });
});

describe("layout persistence", () => {
  it("remembers geometry per app and reuses it on the next open", () => {
    const a = state().openApp(tasks);
    state().moveWindow(a, { x: 333, y: 222 });
    state().resizeWindow(a, { x: 333, y: 222, width: 500, height: 400 });
    state().commitLayout(a);
    state().closeWindow(a);

    const again = state().openApp(tasks);
    expect(state().windows[again]).toMatchObject({
      position: { x: 333, y: 222 },
      size: { width: 500, height: 400 },
    });
  });

  it("persists layouts, and only layouts, to storage", () => {
    const a = state().openApp(tasks);
    state().commitLayout(a);
    const saved = JSON.parse(storage.data.get("hanabrew-windows")!);
    expect(Object.keys(saved.state)).toEqual(["layouts"]);
    expect(saved.state.layouts.tasks).toBeDefined();
  });

  it("a fresh store rehydrates saved layouts but starts with no open windows", () => {
    const a = state().openApp(tasks);
    state().moveWindow(a, { x: 410, y: 160 });
    state().commitLayout(a);

    const fresh = createWindowStore(storage);
    expect(Object.keys(fresh.getState().windows)).toHaveLength(0);
    expect(fresh.getState().layouts.tasks?.position).toEqual({ x: 410, y: 160 });
  });

  it("reopens a window as maximized when it was last maximized", () => {
    const a = state().openApp(tasks);
    state().toggleMaximize(a);
    state().closeWindow(a);
    const reopened = state().openApp(tasks);
    expect(state().windows[reopened]!.state).toBe("maximized");
  });

  it("reset closes everything but keeps remembered layouts", () => {
    const a = state().openApp(tasks);
    state().commitLayout(a);
    state().reset();
    expect(state().windows).toEqual({});
    expect(state().layouts.tasks).toBeDefined();
  });
});

describe("application registry", () => {
  it("has unique ids and routes that match the id", () => {
    const ids = APPLICATIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const app of APPLICATIONS) expect(app.route).toBe(`/apps/${app.id}`);
  });
  it("defaults sit inside a sensible window size", () => {
    for (const app of APPLICATIONS) {
      expect(app.defaultSize!.width).toBeGreaterThanOrEqual(320);
      expect(app.defaultSize!.height).toBeGreaterThanOrEqual(220);
    }
  });
});
