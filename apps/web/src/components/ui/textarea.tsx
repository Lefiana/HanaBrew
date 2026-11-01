import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted",
        "focus-visible:border-ring disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
