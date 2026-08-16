/**
 * Compose Needs attention: indexing contradictions outrank performance attention
 * for the same page (no confusing simultaneous cards).
 */

import type { AttentionItem, AttentionResult } from "./attention-types.js";
import type { DashboardIndexing, IndexingAttentionItem } from "./indexing-types.js";
import { indexingContradictionPageUrls } from "./indexing.js";

export type ComposedAttention = {
  indexing: IndexingAttentionItem[];
  performance: AttentionItem[];
  /** True when indexing suppressed one or more performance cards. */
  performanceSuppressedCount: number;
};

export function composeAttention(args: {
  indexing: DashboardIndexing;
  performance: AttentionResult;
}): ComposedAttention {
  const blocked = indexingContradictionPageUrls(args.indexing);
  const performance = args.performance.items.filter((item) => !blocked.has(item.pageUrl));
  return {
    indexing: args.indexing.attention,
    performance,
    performanceSuppressedCount: args.performance.items.length - performance.length,
  };
}
