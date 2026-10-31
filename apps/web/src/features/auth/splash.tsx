import { Flower2 } from "lucide-react";

export function Splash({ message = "Brewing your desktop…" }: { message?: string }) {
  return (
    <div
      role="status"
      className="hb-wallpaper flex h-dvh flex-col items-center justify-center gap-3 text-muted"
    >
      <Flower2 aria-hidden className="size-10 animate-pulse text-fg motion-reduce:animate-none" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
