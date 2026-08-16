/**
 * Phase 5 Attention & Opportunities — deterministic page-level attention.
 *
 * Derived on demand from stored GSC metrics. No AI. No persistence.
 * One principal item per page. Max ATTENTION_MAX_ITEMS visible.
 */

import type { PeriodMetrics } from "./compare.js";
import {
  ATTENTION_HIGH_IMPRESSIONS,
  ATTENTION_MAX_ITEMS,
  ATTENTION_MIN_IMPRESSIONS,
  ATTENTION_STRONG_IMPRESSIONS,
  ATTENTION_THRESHOLDS,
  COMPARISON_MIN_PREV_IMPRESSIONS,
  LOW_ENGAGEMENT_CTR_MAX,
  LOW_ENGAGEMENT_MAX_CLICKS,
  LOW_ENGAGEMENT_MIN_IMPRESSIONS,
  NEAR_POSITION_MAX,
  NEAR_POSITION_MIN,
  STRONG_POSITION_MAX,
  SUPPORTING_QUERIES_LIMIT,
  VISIBILITY_CHANGE_ABS,
  VISIBILITY_CHANGE_REL,
} from "./attention-thresholds.js";
import type {
  AttentionCategory,
  AttentionConfidence,
  AttentionItem,
  AttentionPageInput,
  AttentionQueryInput,
  AttentionResult,
  AttentionStance,
  AttentionSupportingQuery,
  VisibilityChangeDirection,
} from "./attention-types.js";

export type { AttentionItem, AttentionResult } from "./attention-types.js";
export { ATTENTION_THRESHOLDS } from "./attention-thresholds.js";

const CATEGORY_LABEL: Record<AttentionCategory, string> = {
  WORTH_WATCHING: "Worth watching",
  NEAR_STRONGER_VISIBILITY: "Near stronger visibility",
  VISIBILITY_CHANGE: "Visibility change",
  STRONG_VISIBILITY_LOW_ENGAGEMENT: "Strong visibility, few clicks",
};

const STANCE_LABEL: Record<AttentionStance, string> = {
  watch: "Watch for another reporting period.",
  review: "Review, but don't rush to change it.",
  leave_alone: "Leave it alone while visibility is improving.",
  monitor_momentum: "Monitor — avoid unnecessary changes while momentum develops.",
};

/** Precedence when a page matches multiple rules (lower = wins). */
const CATEGORY_PRECEDENCE: Record<AttentionCategory, number> = {
  VISIBILITY_CHANGE: 1,
  STRONG_VISIBILITY_LOW_ENGAGEMENT: 2,
  NEAR_STRONGER_VISIBILITY: 3,
  WORTH_WATCHING: 4,
};

type Candidate = {
  page: AttentionPageInput;
  category: AttentionCategory;
  confidence: AttentionConfidence;
  stance: AttentionStance;
  reason: string;
  changeDirection: VisibilityChangeDirection | null;
  comparisonEligible: boolean;
  /** Internal sort only — never exposed as an "SEO score". */
  sortKey: number;
};

export function isComparisonEligible(
  previous: PeriodMetrics | null,
  hasFullPrevious: boolean,
): boolean {
  if (!hasFullPrevious || !previous) return false;
  return previous.impressions >= COMPARISON_MIN_PREV_IMPRESSIONS;
}

export function classifyConfidence(args: {
  impressions: number;
  comparisonEligible: boolean;
  category: AttentionCategory;
}): AttentionConfidence {
  const { impressions, comparisonEligible } = args;

  // Without a usable prior window, stay honest — volume alone is still early.
  if (!comparisonEligible) {
    return "early";
  }

  if (impressions >= ATTENTION_HIGH_IMPRESSIONS) {
    return "strong";
  }
  if (impressions >= ATTENTION_STRONG_IMPRESSIONS) {
    return "moderate";
  }
  return "early";
}

export function isMaterialVisibilityChange(
  current: PeriodMetrics,
  previous: PeriodMetrics,
): { material: boolean; direction: VisibilityChangeDirection } {
  const absolute = current.impressions - previous.impressions;
  const relative =
    previous.impressions > 0 ? absolute / previous.impressions : absolute > 0 ? null : 0;
  const material =
    Math.abs(absolute) >= VISIBILITY_CHANGE_ABS &&
    relative != null &&
    Math.abs(relative) >= VISIBILITY_CHANGE_REL;
  return {
    material,
    direction: absolute >= 0 ? "increase" : "decrease",
  };
}

/** Positive momentum: impressions up materially and position not clearly worse. */
export function hasPositiveMomentum(
  current: PeriodMetrics,
  previous: PeriodMetrics,
  comparisonEligible: boolean,
): boolean {
  if (!comparisonEligible) return false;
  const { material, direction } = isMaterialVisibilityChange(current, previous);
  if (!material || direction !== "increase") return false;
  // Position: lower is better. Allow small noise; block if clearly worse.
  const positionWorse = current.position - previous.position > 3;
  return !positionWorse;
}

function matchesNearStronger(m: PeriodMetrics): boolean {
  return (
    m.impressions >= ATTENTION_MIN_IMPRESSIONS &&
    m.position >= NEAR_POSITION_MIN &&
    m.position <= NEAR_POSITION_MAX
  );
}

function matchesWorthWatching(m: PeriodMetrics): boolean {
  return m.impressions >= ATTENTION_MIN_IMPRESSIONS && m.position > NEAR_POSITION_MAX;
}

function matchesLowEngagement(m: PeriodMetrics): boolean {
  if (m.impressions < LOW_ENGAGEMENT_MIN_IMPRESSIONS) return false;
  if (m.position > STRONG_POSITION_MAX || m.position <= 0) return false;
  if (m.ctr >= LOW_ENGAGEMENT_CTR_MAX && m.clicks > LOW_ENGAGEMENT_MAX_CLICKS) return false;
  // Require both coarse CTR weakness and few absolute clicks.
  return m.ctr < LOW_ENGAGEMENT_CTR_MAX && m.clicks <= LOW_ENGAGEMENT_MAX_CLICKS;
}

function evaluatePage(
  page: AttentionPageInput,
  hasFullPrevious: boolean,
): Candidate | null {
  const { current, previous } = page;
  if (current.impressions < ATTENTION_MIN_IMPRESSIONS) return null;

  const comparisonEligible = isComparisonEligible(previous, hasFullPrevious);
  const improving =
    previous != null && hasPositiveMomentum(current, previous, comparisonEligible);

  // --- Rule candidates (collect then pick by precedence) ---
  const matches: Array<Omit<Candidate, "sortKey" | "confidence">> = [];

  if (comparisonEligible && previous) {
    const change = isMaterialVisibilityChange(current, previous);
    if (change.material) {
      if (change.direction === "decrease") {
        matches.push({
          page,
          category: "VISIBILITY_CHANGE",
          stance: "review",
          reason: buildVisibilityChangeReason(current, previous, "decrease"),
          changeDirection: "decrease",
          comparisonEligible,
        });
      } else if (!matchesLowEngagement(current)) {
        // Increase → surface as monitor/leave-alone, not as an intervention.
        matches.push({
          page,
          category: "VISIBILITY_CHANGE",
          stance: improving ? "leave_alone" : "monitor_momentum",
          reason: buildVisibilityChangeReason(current, previous, "increase"),
          changeDirection: "increase",
          comparisonEligible,
        });
      }
    }
  }

  if (matchesLowEngagement(current)) {
    // Anti-churn: if clearly improving with no other red flag, soften to leave_alone
    // only when we would otherwise push review — still surface the evidence.
    matches.push({
      page,
      category: "STRONG_VISIBILITY_LOW_ENGAGEMENT",
      stance: improving ? "watch" : "review",
      reason: buildLowEngagementReason(current),
      changeDirection: null,
      comparisonEligible,
    });
  }

  if (matchesNearStronger(current)) {
    // Anti-churn: improving pages in this band → leave alone / watch, not rewrite.
    const stance: AttentionStance = improving
      ? "leave_alone"
      : current.impressions >= ATTENTION_STRONG_IMPRESSIONS
        ? "review"
        : "watch";
    matches.push({
      page,
      category: "NEAR_STRONGER_VISIBILITY",
      stance,
      reason: buildNearStrongerReason(current),
      changeDirection: null,
      comparisonEligible,
    });
  } else if (matchesWorthWatching(current)) {
    matches.push({
      page,
      category: "WORTH_WATCHING",
      stance: improving ? "leave_alone" : "watch",
      reason: buildWorthWatchingReason(current),
      changeDirection: null,
      comparisonEligible,
    });
  }

  if (matches.length === 0) return null;

  matches.sort(
    (a, b) => CATEGORY_PRECEDENCE[a.category] - CATEGORY_PRECEDENCE[b.category],
  );
  const best = matches[0]!;
  const confidence = classifyConfidence({
    impressions: current.impressions,
    comparisonEligible,
    category: best.category,
  });

  return {
    ...best,
    confidence,
    sortKey: computeSortKey(best.category, confidence, current, best.changeDirection),
  };
}

function computeSortKey(
  category: AttentionCategory,
  confidence: AttentionConfidence,
  metrics: PeriodMetrics,
  changeDirection: VisibilityChangeDirection | null,
): number {
  // Category precedence dominates confidence so near-visibility outranks
  // high-volume "watch" pages when both are early signals.
  const catW = (5 - CATEGORY_PRECEDENCE[category]) * 100_000;
  const confW = confidence === "strong" ? 30_000 : confidence === "moderate" ? 20_000 : 10_000;
  const declineBoost = changeDirection === "decrease" ? 15_000 : 0;
  const volume = Math.min(metrics.impressions, 50_000);
  const nearBoost =
    category === "NEAR_STRONGER_VISIBILITY"
      ? Math.max(0, Math.round((NEAR_POSITION_MAX - metrics.position) * 80))
      : 0;
  return catW + confW + declineBoost + volume + nearBoost;
}

function buildWorthWatchingReason(m: PeriodMetrics): string {
  const impr = Math.round(m.impressions);
  const pos = m.position.toFixed(1);
  return `Google showed this page ${impr} times in the last reporting period. Its average position was ${pos}, so it is getting meaningful exposure while still usually appearing outside stronger results. The data is still early — enough to monitor, not enough to force changes.`;
}

function buildNearStrongerReason(m: PeriodMetrics): string {
  const impr = Math.round(m.impressions);
  const pos = m.position.toFixed(1);
  return `This page appeared ${impr} times with an average position of ${pos}, which is relatively close to stronger search positions and already has meaningful impressions. Average position is aggregated across queries — treat it as a signal, not an exact rank.`;
}

function buildVisibilityChangeReason(
  current: PeriodMetrics,
  previous: PeriodMetrics,
  direction: VisibilityChangeDirection,
): string {
  const cur = Math.round(current.impressions);
  const prev = Math.round(previous.impressions);
  if (direction === "increase") {
    return `Visibility increased meaningfully: about ${prev} impressions in the previous period versus ${cur} now. When visibility is growing, unnecessary page changes can interrupt momentum.`;
  }
  return `Visibility decreased meaningfully: about ${prev} impressions in the previous period versus ${cur} now. Review the page and its search mix before changing anything.`;
}

function buildLowEngagementReason(m: PeriodMetrics): string {
  const impr = Math.round(m.impressions);
  const pos = m.position.toFixed(1);
  const clicks = Math.round(m.clicks);
  return `This page appeared about ${impr} times at a relatively strong average position of ${pos}, but received only ${clicks} click${clicks === 1 ? "" : "s"}. The search intent or how the result looks in Google may be worth reviewing — this is not proof that the title or page is wrong.`;
}

function supportingForPage(
  pageUrl: string,
  queries: AttentionQueryInput[],
): AttentionSupportingQuery[] {
  return queries
    .filter((q) => q.pageUrl === pageUrl)
    .sort(
      (a, b) =>
        b.impressions - a.impressions ||
        b.clicks - a.clicks ||
        a.query.localeCompare(b.query),
    )
    .slice(0, SUPPORTING_QUERIES_LIMIT)
    .map((q) => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.ctr,
      position: q.position,
    }));
}

function fingerprint(args: {
  pageUrl: string;
  category: AttentionCategory;
  dataThrough: string;
  periodDays: number;
}): string {
  // Deterministic, URL-safe id for React keys / future dismiss hooks.
  const raw = `${args.category}|${args.pageUrl}|${args.dataThrough}|${args.periodDays}`;
  return `att_${simpleHash(raw)}`;
}

function simpleHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function generateAttention(args: {
  pages: AttentionPageInput[];
  queries: AttentionQueryInput[];
  hasFullPrevious: boolean;
  dataThrough: string;
  periodDays: number;
  /** Project-level prior impressions (ORIGIN totals) for immature banner. */
  projectPreviousImpressions: number | null;
  projectCurrentImpressions: number;
  generatedAt?: string;
}): AttentionResult {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const candidates: Candidate[] = [];

  for (const page of args.pages) {
    const c = evaluatePage(page, args.hasFullPrevious);
    if (c) candidates.push(c);
  }

  candidates.sort(
    (a, b) =>
      b.sortKey - a.sortKey ||
      b.page.current.impressions - a.page.current.impressions ||
      a.page.pageUrl.localeCompare(b.page.pageUrl),
  );

  const immature =
    args.projectCurrentImpressions < ATTENTION_STRONG_IMPRESSIONS ||
    (args.projectPreviousImpressions != null &&
      args.projectPreviousImpressions < COMPARISON_MIN_PREV_IMPRESSIONS) ||
    !args.hasFullPrevious;

  // Prefer fewer high-value cards while project data is immature (SRP-era).
  const maxVisible = immature ? Math.min(3, ATTENTION_MAX_ITEMS) : ATTENTION_MAX_ITEMS;

  const items: AttentionItem[] = candidates.slice(0, maxVisible).map((c) => ({
    id: fingerprint({
      pageUrl: c.page.pageUrl,
      category: c.category,
      dataThrough: args.dataThrough,
      periodDays: args.periodDays,
    }),
    pageUrl: c.page.pageUrl,
    label: c.page.label,
    path: c.page.path,
    category: c.category,
    categoryLabel: CATEGORY_LABEL[c.category],
    confidence: c.confidence,
    reason: c.reason,
    stance: c.stance,
    stanceLabel: STANCE_LABEL[c.stance],
    metrics: c.page.current,
    previous: c.page.previous,
    comparisonEligible: c.comparisonEligible,
    changeDirection: c.changeDirection,
    supportingQueries: supportingForPage(c.page.pageUrl, args.queries),
    dataThrough: args.dataThrough,
    generatedAt,
  }));

  let emptyMessage: string | null = null;
  if (items.length === 0) {
    emptyMessage = immature
      ? "Nothing needs attention yet. Search visibility is still developing. We’ll surface stronger opportunities as more data accumulates."
      : "Nothing needs attention yet. No pages crossed the evidence threshold for this period.";
  }

  return {
    items,
    emptyMessage,
    immature,
    thresholds: ATTENTION_THRESHOLDS,
    generatedAt,
  };
}

/** Confidence label for UI / docs. */
export function confidenceLabel(c: AttentionConfidence): string {
  switch (c) {
    case "early":
      return "Early signal";
    case "moderate":
      return "Moderate evidence";
    case "strong":
      return "Strong evidence";
  }
}
