"use client";

import { MobileHome } from "@/components/mobile/mobile-home";
import { DesktopShell } from "@/components/desktop/desktop-shell";
import { AuthGate } from "@/features/auth/auth-gate";
import { Splash } from "@/features/auth/splash";
import { useIsDesktop } from "@/hooks/use-media-query";

function Home() {
  const isDesktop = useIsDesktop();
  if (isDesktop === null) return <Splash />;
  return isDesktop ? <DesktopShell /> : <MobileHome />;
}

export default function HomePage() {
  return (
    <AuthGate>
      <Home />
    </AuthGate>
  );
}
