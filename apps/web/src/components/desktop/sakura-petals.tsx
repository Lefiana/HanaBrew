import type { CSSProperties } from "react";

const PETAL_COUNT = 14;

/** Deterministic parameters (no randomness) so server and client render identical markup. */
const PETALS = Array.from({ length: PETAL_COUNT }, (_, i) => ({
  left: `${(i * 53 + 7) % 100}%`,
  "--hb-size": `${10 + ((i * 7) % 10)}px`,
  "--hb-dur": `${16 + ((i * 5) % 12)}s`,
  "--hb-delay": `${-((i * 37) % 200) / 10}s`,
  "--hb-drift": `${i % 2 ? "" : "-"}${4 + ((i * 3) % 9)}vw`,
  "--hb-spin": `${360 + ((i * 47) % 360)}deg`,
})) as CSSProperties[];

export function SakuraPetals() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PETALS.map((style, i) => (
        <span key={i} className="hb-petal" style={style} />
      ))}
    </div>
  );
}
