import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="hb-wallpaper flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">That page wandered off</h1>
      <p className="text-muted">We couldn’t find what you were looking for.</p>
      <Button asChild>
        <Link href="/">Back to your desktop</Link>
      </Button>
    </main>
  );
}
