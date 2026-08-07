import { describe, expect, it } from 'vitest';
import { DAILY_ITEM_GRANT_FREE, DAILY_ITEM_GRANT_LEGENDARY } from '@kairo/core';
import { dailyItemsFrom } from './items.ts';

describe('dailyItemsFrom', () => {
  it('treats a missing ledger row as granted-and-unspent', () => {
    // The row is materialised lazily, on the first deploy. Reading absence as
    // "no items" would show every new user zero bananas and disable the only
    // affordance that could create the row — a deadlock, not a display bug.
    expect(dailyItemsFrom(null, false)).toEqual({
      granted: DAILY_ITEM_GRANT_FREE,
      deployed: 0,
      remaining: DAILY_ITEM_GRANT_FREE,
    });
  });

  it('gives a Legendary user the larger grant when the row is missing', () => {
    expect(dailyItemsFrom(null, true).remaining).toBe(DAILY_ITEM_GRANT_LEGENDARY);
  });

  it('trusts an existing row over today’s grant constant', () => {
    // `granted` is written once, when the row is created, and never topped up:
    // anyone who deployed before the grant was raised keeps the old number for
    // the rest of their local day. The ledger is the authority, not the client.
    expect(dailyItemsFrom({ granted: 1, deployed: 0 }, false)).toEqual({
      granted: 1,
      deployed: 0,
      remaining: 1,
    });
  });

  it('subtracts what has been spent', () => {
    expect(dailyItemsFrom({ granted: 2, deployed: 1 }, false).remaining).toBe(1);
  });

  it('reports zero rather than a negative remainder', () => {
    // daily_item_ledger_cannot_overdeploy makes this unreachable in the
    // database, but a UI that can render "-1 bananas" from a bad read is worse
    // than one that cannot.
    expect(dailyItemsFrom({ granted: 2, deployed: 3 }, false).remaining).toBe(0);
  });
});
