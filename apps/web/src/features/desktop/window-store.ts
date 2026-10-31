import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { DesktopApplication } from "./app-registry";
import type { DesktopWindow, Point, Rect, Size, WindowLayout } from "./types";
import {
  cascadePosition,
  clampPosition,
  fitRect,
  getWorkArea,
  maximizedRect,
  MIN_WINDOW_SIZE,
} from "./window-math";

const BASE_Z = 10;
const DEFAULT_SIZE: Size = { width: 760, height: 520 };
const DEFAULT_VIEWPORT: Size = { width: 1280, height: 800 };

export interface WindowStoreState {
  windows: Record<string, DesktopWindow>;
  focusedId: string | null;
  zCounter: number;
  viewport: Size;
  /** Remembered per-app geometry. This (and only this) is persisted. */
  layouts: Record<string, WindowLayout>;

  openApp: (app: DesktopApplication) => string;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  focusWindow: (id: string) => void;
  moveWindow: (id: string, position: Point) => void;
  resizeWindow: (id: string, rect: Rect) => void;
  /** Saves the window's current geometry as the app's preferred layout. */
  commitLayout: (id: string) => void;
  setViewport: (viewport: Size) => void;
  reset: () => void;
}

/** Window ids are deterministic: the desktop keeps one window per application. */
export const windowIdFor = (appId: string): string => `win:${appId}`;

function topVisibleWindowId(windows: Record<string, DesktopWindow>): string | null {
  const visible = Object.values(windows)
    .filter((w) => w.state !== "minimized")
    .sort((a, b) => b.zIndex - a.zIndex);
  return visible[0]?.id ?? null;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export function createWindowStore(storage?: StateStorage): StoreApi<WindowStoreState> {
  const resolveStorage = (): StateStorage =>
    storage ?? (typeof window === "undefined" ? noopStorage : window.localStorage);

  return createStore<WindowStoreState>()(
    persist(
      (set, get) => ({
        windows: {},
        focusedId: null,
        zCounter: BASE_Z,
        viewport: DEFAULT_VIEWPORT,
        layouts: {},

        openApp: (app) => {
          const id = windowIdFor(app.id);
          const existing = get().windows[id];
          if (existing) {
            if (existing.state === "minimized") get().restoreWindow(id);
            else get().focusWindow(id);
            return id;
          }

          const { viewport, layouts, windows, zCounter } = get();
          const workArea = getWorkArea(viewport);
          const saved = layouts[app.id];
          const requested = saved?.size ?? app.defaultSize ?? DEFAULT_SIZE;
          const base = fitRect(
            {
              ...requested,
              ...(saved?.position ??
                cascadePosition(Object.keys(windows).length, requested, workArea)),
            },
            workArea,
          );

          const z = zCounter + 1;
          set({
            zCounter: z,
            focusedId: id,
            windows: {
              ...windows,
              [id]: {
                id,
                appId: app.id,
                title: app.name,
                position: { x: base.x, y: base.y },
                size: { width: base.width, height: base.height },
                state: saved?.maximized ? "maximized" : "normal",
                restoreState: saved?.maximized ? "maximized" : "normal",
                zIndex: z,
              },
            },
          });
          return id;
        },

        closeWindow: (id) =>
          set((s) => {
            const { [id]: _removed, ...rest } = s.windows;
            return {
              windows: rest,
              focusedId: s.focusedId === id ? topVisibleWindowId(rest) : s.focusedId,
            };
          }),

        minimizeWindow: (id) =>
          set((s) => {
            const w = s.windows[id];
            if (!w || w.state === "minimized") return s;
            const windows = {
              ...s.windows,
              [id]: { ...w, state: "minimized" as const, restoreState: w.state },
            };
            return {
              windows,
              focusedId: s.focusedId === id ? topVisibleWindowId(windows) : s.focusedId,
            };
          }),

        restoreWindow: (id) =>
          set((s) => {
            const w = s.windows[id];
            if (!w) return s;
            const z = s.zCounter + 1;
            return {
              zCounter: z,
              focusedId: id,
              windows: { ...s.windows, [id]: { ...w, state: w.restoreState, zIndex: z } },
            };
          }),

        toggleMaximize: (id) => {
          set((s) => {
            const w = s.windows[id];
            if (!w || w.state === "minimized") return s;
            const next = w.state === "maximized" ? "normal" : "maximized";
            const z = s.zCounter + 1;
            return {
              zCounter: z,
              focusedId: id,
              windows: { ...s.windows, [id]: { ...w, state: next, restoreState: next, zIndex: z } },
            };
          });
          get().commitLayout(id);
        },

        focusWindow: (id) =>
          set((s) => {
            const w = s.windows[id];
            if (!w || w.state === "minimized") return s;
            if (s.focusedId === id && w.zIndex === s.zCounter) return s;
            const z = s.zCounter + 1;
            return {
              zCounter: z,
              focusedId: id,
              windows: { ...s.windows, [id]: { ...w, zIndex: z } },
            };
          }),

        moveWindow: (id, position) =>
          set((s) => {
            const w = s.windows[id];
            if (!w || w.state !== "normal") return s;
            const next = clampPosition(position, w.size, getWorkArea(s.viewport));
            return { windows: { ...s.windows, [id]: { ...w, position: next } } };
          }),

        resizeWindow: (id, rect) =>
          set((s) => {
            const w = s.windows[id];
            if (!w || w.state !== "normal") return s;
            const fitted = fitRect(rect, getWorkArea(s.viewport), MIN_WINDOW_SIZE);
            return {
              windows: {
                ...s.windows,
                [id]: {
                  ...w,
                  position: { x: fitted.x, y: fitted.y },
                  size: { width: fitted.width, height: fitted.height },
                },
              },
            };
          }),

        commitLayout: (id) =>
          set((s) => {
            const w = s.windows[id];
            if (!w) return s;
            const maximized =
              w.state === "maximized" ||
              (w.state === "minimized" && w.restoreState === "maximized");
            return {
              layouts: {
                ...s.layouts,
                [w.appId]: { position: w.position, size: w.size, maximized },
              },
            };
          }),

        setViewport: (viewport) =>
          set((s) => {
            if (viewport.width === s.viewport.width && viewport.height === s.viewport.height)
              return s;
            const workArea = getWorkArea(viewport);
            const windows = Object.fromEntries(
              Object.entries(s.windows).map(([id, w]) => {
                const fitted = fitRect({ ...w.position, ...w.size }, workArea);
                return [
                  id,
                  {
                    ...w,
                    position: { x: fitted.x, y: fitted.y },
                    size: { width: fitted.width, height: fitted.height },
                  },
                ];
              }),
            );
            return { viewport, windows };
          }),

        reset: () => set({ windows: {}, focusedId: null, zCounter: BASE_Z }),
      }),
      {
        name: "hanabrew-windows",
        version: 1,
        storage: createJSONStorage(resolveStorage),
        partialize: (s) => ({ layouts: s.layouts }),
      },
    ),
  );
}

/** Rectangle a window occupies right now (maximized windows fill the work area). */
export function effectiveRect(w: DesktopWindow, viewport: Size): Rect {
  return w.state === "maximized"
    ? maximizedRect(getWorkArea(viewport))
    : { ...w.position, ...w.size };
}
