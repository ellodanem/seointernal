/**
 * Freshness guard for URL Inspection — skip recently successful inspections.
 */

export function isInspectionFresh(args: {
  lastSuccessfulAt: Date | null | undefined;
  now?: Date;
  freshnessMs: number;
}): boolean {
  if (!args.lastSuccessfulAt) return false;
  const now = args.now ?? new Date();
  const age = now.getTime() - args.lastSuccessfulAt.getTime();
  return age >= 0 && age < args.freshnessMs;
}

export function shouldInspectPage(args: {
  lastSuccessfulAt: Date | null | undefined;
  force: boolean;
  freshnessMs: number;
  now?: Date;
}): boolean {
  if (args.force) return true;
  return !isInspectionFresh({
    lastSuccessfulAt: args.lastSuccessfulAt,
    freshnessMs: args.freshnessMs,
    now: args.now,
  });
}
