import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted",
        "focus-visible:border-ring disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
