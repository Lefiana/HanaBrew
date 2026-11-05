import type { HanaMood } from "@hanabrew/contracts";
import { cn } from "@/lib/cn";

/**
 * PLACEHOLDER for Hana's chibi companion: one emoji per mood.
 *
 * To swap in real art, set USE_IMAGE_ASSETS to true and add one image per mood at
 * apps/web/public/characters/hana/<mood>.webp (idle, listening, thinking, happy, concerned, encouraging,
 * sleeping). Nothing else needs to change: the chat only passes a mood to this component, and the mood is
 * a purely visual cue (it never says anything about whether an answer is correct).
 */
const USE_IMAGE_ASSETS = false;
const IMAGE_BASE = "/characters/hana";

const EMOJI: Record<HanaMood, string> = {
  idle: "☕",
  listening: "👂",
  thinking: "💭",
  happy: "🌸",
  concerned: "🥺",
  encouraging: "💪",
  sleeping: "😴",
};

export function HanaAvatar({ mood, className }: { mood: HanaMood; className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Hana is ${mood}`}
      data-mood={mood}
      className={cn(
        "grid size-14 shrink-0 place-items-center rounded-full border border-border bg-accent/40 text-2xl shadow-soft",
        className,
      )}
    >
      {USE_IMAGE_ASSETS ? (
        <img
          src={`${IMAGE_BASE}/${mood}.webp`}
          alt=""
          className="size-full rounded-full object-cover"
        />
      ) : (
        <span aria-hidden>{EMOJI[mood]}</span>
      )}
    </div>
  );
}
