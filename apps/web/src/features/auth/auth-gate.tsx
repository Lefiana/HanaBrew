"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiRequestError } from "@/lib/api-client";
import { Splash } from "./splash";
import { useMe } from "./use-me";

/** Renders children only for a signed-in user. The API remains the real authority on every request. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const unauthorized = me.error instanceof ApiRequestError && me.error.isUnauthorized;

  useEffect(() => {
    if (unauthorized) router.replace("/sign-in");
  }, [unauthorized, router]);

  if (me.isPending || unauthorized)
    return <Splash message={unauthorized ? "Taking you to sign in…" : undefined} />;

  if (me.isError) {
    return (
      <main className="hb-wallpaper flex h-dvh items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <h1 className="text-lg font-semibold">We couldn’t reach HanaBrew</h1>
          <p className="mt-2 text-sm text-muted">{me.error.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => void me.refetch()}>Try again</Button>
            <Button variant="outline" asChild>
              <Link href="/status">Check status</Link>
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
