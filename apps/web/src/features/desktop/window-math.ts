import type { Point, Rect, ResizeHandle, Size } from "./types";

/** Space reserved at the top (menu bar) and bottom (dock) of the viewport. */
export const TOP_INSET = 40;
export const BOTTOM_INSET = 88;
/** Height of a window title bar: it must always stay reachable. */
export const TITLEBAR_HEIGHT = 40;
/** At least this much of a window must remain on screen horizontally so it can be grabbed. */
export const MIN_VISIBLE_WIDTH = 120;
export const MIN_WINDOW_SIZE: Size = { width: 320, height: 220 };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function getWorkArea(viewport: Size): Rect {
  return {
    x: 0,
    y: TOP_INSET,
    width: viewport.width,
    height: Math.max(0, viewport.height - TOP_INSET - BOTTOM_INSET),
  };
}

export function clampSize(size: Size, workArea: Rect, min: Size = MIN_WINDOW_SIZE): Size {
  return {
    width: clamp(size.width, Math.min(min.width, workArea.width), workArea.width),
    height: clamp(size.height, Math.min(min.height, workArea.height), workArea.height),
  };
}

/** Keeps the title bar inside the work area and at least MIN_VISIBLE_WIDTH of the window visible. */
export function clampPosition(position: Point, size: Size, workArea: Rect): Point {
  const visible = Math.min(MIN_VISIBLE_WIDTH, size.width);
  return {
    x: clamp(position.x, workArea.x - size.width + visible, workArea.x + workArea.width - visible),
    y: clamp(position.y, workArea.y, workArea.y + workArea.height - TITLEBAR_HEIGHT),
  };
}

export function fitRect(rect: Rect, workArea: Rect, min: Size = MIN_WINDOW_SIZE): Rect {
  const size = clampSize(rect, workArea, min);
  return { ...clampPosition(rect, size, workArea), ...size };
}

export function maximizedRect(workArea: Rect): Rect {
  return { ...workArea };
}

/** Centres a window in the work area, offsetting each additional window so they cascade. */
export function cascadePosition(index: number, size: Size, workArea: Rect): Point {
  const step = 28;
  const offset = (index % 8) * step;
  return clampPosition(
    {
      x: workArea.x + (workArea.width - size.width) / 2 + offset - 3 * step,
      y: workArea.y + (workArea.height - size.height) / 2 + offset - 3 * step,
    },
    size,
    workArea,
  );
}

/**
 * Computes the rectangle produced by dragging `handle` by (dx, dy) from `start`.
 * Always derived from the gesture's starting rect, so there is no accumulated drift.
 * The opposite edge stays fixed; the result never leaves the work area or drops below `min`.
 */
export function resizeRect(
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  workArea: Rect,
  min: Size = MIN_WINDOW_SIZE,
): Rect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle.includes("e"))
    right = clamp(right + dx, left + min.width, workArea.x + workArea.width);
  if (handle.includes("w")) left = clamp(left + dx, workArea.x, right - min.width);
  if (handle.includes("s"))
    bottom = clamp(bottom + dy, top + min.height, workArea.y + workArea.height);
  if (handle.includes("n")) top = clamp(top + dy, workArea.y, bottom - min.height);

  return { x: left, y: top, width: right - left, height: bottom - top };
}
