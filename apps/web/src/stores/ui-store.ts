import { create } from "zustand";
import { persist } from "zustand/middleware";

export const THEMES = ["sakura-latte", "midnight-blossom"] as const;
export type Theme = (typeof THEMES)[number];
export type MotionPreference = "system" | "reduced";

export const THEME_LABELS: Record<Theme, string> = {
  "sakura-latte": "Sakura Latte",
  "midnight-blossom": "Midnight Blossom",
};

interface UiState {
  theme: Theme;
  motion: MotionPreference;
  launcherOpen: boolean;
  setTheme: (theme: Theme) => void;
  setMotion: (motion: MotionPreference) => void;
  setLauncherOpen: (open: boolean) => void;
}

function applyToDocument(theme: Theme, motion: MotionPreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  if (motion === "reduced") document.documentElement.dataset.motion = "reduced";
  else delete document.documentElement.dataset.motion;
}

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** Matches the document attribute the pre-hydration script (theme-script.ts) already set. */
function initialTheme(): Theme {
  if (typeof document === "undefined") return "sakura-latte";
  const current = document.documentElement.dataset.theme;
  return isTheme(current) ? current : "sakura-latte";
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: initialTheme(),
      motion: "system",
      launcherOpen: false,
      setTheme: (theme) => {
        applyToDocument(theme, get().motion);
        set({ theme });
      },
      setMotion: (motion) => {
        applyToDocument(get().theme, motion);
        set({ motion });
      },
      setLauncherOpen: (launcherOpen) => set({ launcherOpen }),
    }),
    {
      name: "hanabrew-ui",
      version: 1,
      partialize: (s) => ({ theme: s.theme, motion: s.motion }),
      onRehydrateStorage: () => (state) => {
        if (state) applyToDocument(state.theme, state.motion);
      },
    },
  ),
);
