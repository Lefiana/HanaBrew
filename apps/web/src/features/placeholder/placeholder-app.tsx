import { Card } from "@/components/ui/card";

interface PlaceholderAppProps {
  name: string;
  milestone: string;
  summary: string;
  planned: string[];
}

/** Honest stand-in for applications that are scheduled for a later milestone. Stores nothing. */
export function PlaceholderApp({ name, milestone, summary, planned }: PlaceholderAppProps) {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-on-secondary">
          Arrives in {milestone}
        </span>
        <h2 className="mt-3 text-2xl font-semibold">{name}</h2>
        <p className="mt-1 text-muted">{summary}</p>
      </div>
      <Card>
        <h3 className="text-sm font-semibold">Planned for this app</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-muted">
        This window is a layout preview for the desktop environment. Nothing here is saved yet.
      </p>
    </div>
  );
}
