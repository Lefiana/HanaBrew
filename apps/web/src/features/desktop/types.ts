export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Point, Size {}

export type WindowState = "normal" | "minimized" | "maximized";

export interface DesktopWindow {
  id: string;
  appId: string;
  title: string;
  position: Point;
  size: Size;
  state: WindowState;
  /** What a minimized window returns to when restored. */
  restoreState: Exclude<WindowState, "minimized">;
  zIndex: number;
}

export interface WindowLayout {
  position: Point;
  size: Size;
  maximized: boolean;
}

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
