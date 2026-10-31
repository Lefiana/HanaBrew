import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "@/styles/globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "HanaBrew", template: "%s · HanaBrew" },
  description: "A cozy, modular productivity desktop with an AI companion.",
  applicationName: "HanaBrew",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffdd0" },
    { media: "(prefers-color-scheme: dark)", color: "#15131d" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set by THEME_SCRIPT before paint, so the server/client attribute differs on purpose.
    <html lang="en" data-theme="sakura-latte" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
