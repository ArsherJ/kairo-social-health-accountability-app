import { dailyGrantFor } from '@kairo/core';

/** The two columns of `daily_item_ledger` the client reads. */
export type LedgerRow = { granted: number; deployed: number };

export type DailyItems = {
  granted: number;
  deployed: number;
  /** What the 🍌 affordance is enabled by. Never negative. */
  remaining: number;
};

/**
 * How many items the caller has left today.
 *
 * Extracted from the hook so the one decision that matters here is testable
 * without a query client: **a missing row means granted-and-unspent**, not
 * "none". `deploy-sabotage` materialises the ledger row on first use, so
 * before anyone's first throw of the day there is nothing to read — and
 * reading that as zero would disable the only affordance that could create it.
 *
 * An existing row wins over `dailyGrantFor`. `granted` is written once and
 * never topped up, so a user who deployed before the grant was raised keeps
 * the old number until their local day rolls over.
 */
export function dailyItemsFrom(
  row: LedgerRow | null | undefined,
  isLegendary: boolean,
): DailyItems {
  const granted = row?.granted ?? dailyGrantFor(isLegendary);
  const deployed = row?.deployed ?? 0;
  return { granted, deployed, remaining: Math.max(0, granted - deployed) };
}
