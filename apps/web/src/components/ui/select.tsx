import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Native <select>: accessible and touch-friendly everywhere, styled to the theme. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-border bg-bg px-2.5 text-sm text-fg focus-visible:border-ring disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
