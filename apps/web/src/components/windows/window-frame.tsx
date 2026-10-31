"use client";

import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AppIcon } from "@/features/desktop/app-icons";
import type { DesktopApplication } from "@/features/desktop/app-registry";
import type { DesktopWindow, Point, Rect, ResizeHandle, Size } from "@/features/desktop/types";
import { effectiveRect } from "@/features/desktop/window-store";
import { getWorkArea, resizeRect } from "@/features/desktop/window-math";
import { cn } from "@/lib/cn";
import { windowStore } from "@/stores/window-store-instance";

interface WindowFrameProps {
  win: DesktopWindow;
  app: DesktopApplication;
  active: boolean;
  viewport: Size;
  children: React.ReactNode;
}

const HANDLES: Array<{ handle: ResizeHandle; className: string; cursor: string }> = [
  { handle: "n", className: "inset-x-3 top-0 h-1.5", cursor: "ns-resize" },
  { handle: "s", className: "inset-x-3 bottom-0 h-1.5", cursor: "ns-resize" },
  { handle: "e", className: "inset-y-3 right-0 w-1.5", cursor: "ew-resize" },
  { handle: "w", className: "inset-y-3 left-0 w-1.5", cursor: "ew-resize" },
  { handle: "ne", className: "right-0 top-0 size-3", cursor: "nesw-resize" },
  { handle: "nw", className: "left-0 top-0 size-3", cursor: "nwse-resize" },
  { handle: "se", className: "bottom-0 right-0 size-3", cursor: "nwse-resize" },
  { handle: "sw", className: "bottom-0 left-0 size-3", cursor: "nesw-resize" },
];

type Gesture =
  | { kind: "drag"; startX: number; startY: number; origin: Point }
  | { kind: "resize"; handle: ResizeHandle; startX: number; startY: number; origin: Rect };

export function WindowFrame({ win, app, active, viewport, children }: WindowFrameProps) {
  const ref = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [gesturing, setGesturing] = useState(false);

  const minimized = win.state === "minimized";
  const maximized = win.state === "maximized";
  const rect = effectiveRect(win, viewport);

  // Move keyboard focus into a window when it becomes the active one (e.g. opened from the dock).
  useEffect(() => {
    const el = ref.current;
    if (active && !minimized && el && !el.contains(document.activeElement)) {
      el.focus({ preventScroll: true });
    }
  }, [active, minimized]);

  const actions = () => windowStore.getState();

  function begin(next: Gesture, event: PointerEvent<HTMLElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = next;
    setGesturing(true);
  }

  function end() {
    if (!gesture.current) return;
    gesture.current = null;
    setGesturing(false);
    actions().commitLayout(win.id);
  }

  function onMove(event: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (g.kind === "drag") {
      actions().moveWindow(win.id, { x: g.origin.x + dx, y: g.origin.y + dy });
    } else {
      actions().resizeWindow(win.id, resizeRect(g.origin, g.handle, dx, dy, getWorkArea(viewport)));
    }
  }

  function onTitlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || win.state !== "normal") return;
    if ((event.target as HTMLElement).closest("[data-window-control]")) return;
    begin(
      { kind: "drag", startX: event.clientX, startY: event.clientY, origin: win.position },
      event,
    );
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (win.state !== "normal" || event.target !== event.currentTarget) return;
    const step = event.shiftKey ? 64 : 16;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    actions().moveWindow(win.id, { x: win.position.x + move.x, y: win.position.y + move.y });
    actions().commitLayout(win.id);
  }

  return (
    <motion.section
      ref={ref}
      role="region"
      aria-label={win.title}
      tabIndex={-1}
      inert={minimized}
      aria-hidden={minimized}
      onPointerDownCapture={() => actions().focusWindow(win.id)}
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={minimized ? { opacity: 0, scale: 0.9, y: 48 } : { opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: win.zIndex,
      }}
      className={cn(
        "pointer-events-auto absolute flex flex-col overflow-hidden border bg-surface shadow-window outline-none",
        maximized ? "rounded-none" : "rounded-xl",
        active ? "border-ring/60" : "border-border",
        minimized && "pointer-events-none",
        !gesturing &&
          "transition-[left,top,width,height] duration-200 motion-reduce:transition-none",
      )}
    >
      <header
        tabIndex={0}
        aria-label={`${win.title} title bar. Use arrow keys to move.`}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onTitleKeyDown}
        onDoubleClick={(event) => {
          if (!(event.target as HTMLElement).closest("[data-window-control]"))
            actions().toggleMaximize(win.id);
        }}
        className={cn(
          "hb-glass flex h-10 shrink-0 touch-none select-none items-center gap-2 border-0 border-b px-3",
          win.state === "normal" ? "cursor-grab active:cursor-grabbing" : "cursor-default",
          !active && "opacity-80",
        )}
      >
        <AppIcon icon={app.icon} className="size-4 shrink-0" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{win.title}</h2>
        <div className="flex items-center gap-1">
          <ControlButton
            label={`Minimize ${win.title}`}
            onClick={() => actions().minimizeWindow(win.id)}
          >
            <Minus className="size-4" />
          </ControlButton>
          <ControlButton
            label={maximized ? `Restore ${win.title}` : `Maximize ${win.title}`}
            onClick={() => actions().toggleMaximize(win.id)}
          >
            {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </ControlButton>
          <ControlButton
            label={`Close ${win.title}`}
            danger
            onClick={() => actions().closeWindow(win.id)}
          >
            <X className="size-4" />
          </ControlButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">{children}</div>

      {win.state === "normal" &&
        HANDLES.map(({ handle, className, cursor }) => (
          <div
            key={handle}
            aria-hidden
            data-resize-handle={handle}
            className={cn("absolute touch-none", className)}
            style={{ cursor }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              begin(
                {
                  kind: "resize",
                  handle,
                  startX: event.clientX,
                  startY: event.clientY,
                  origin: { ...win.position, ...win.size },
                },
                event,
              );
            }}
            onPointerMove={onMove}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
    </motion.section>
  );
}

function ControlButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-window-control
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md transition-colors motion-reduce:transition-none",
        danger ? "hover:bg-danger hover:text-on-danger" : "hover:bg-fg/10",
      )}
    >
      {children}
    </button>
  );
}
