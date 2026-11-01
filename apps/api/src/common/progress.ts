/** completed / (total - cancelled) as a whole percent. Cancelled tasks don't count against progress. */
export function percentComplete(counts: {
  completed: number;
  total: number;
  cancelled: number;
}): number {
  const denominator = counts.total - counts.cancelled;
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((counts.completed / denominator) * 100));
}
