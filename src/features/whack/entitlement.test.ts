import { describe, expect, it } from 'vitest';
import { whackEarned } from './entitlement.ts';
import { WHACK_COPY, whackBackLine, whackRowMark } from './whack-copy.ts';

describe('whack presentation', () => {
  it.each(
    [
      [{ STR: 'gold' }, false, true],
      [{ STR: 'silver' }, true, true],
      [{ STR: 'silver' }, false, false],
      [{ STR: 'gold' }, true, true],
      [undefined, false, false],
    ] as const,
  )('derives one entitlement from %j / %s', (tiers, verifiedSessionToday, earned) => {
    expect(whackEarned({ tiers, verifiedSessionToday })).toBe(earned);
  });
  it('does not invent a currency', () => {
    expect([...Object.values(WHACK_COPY), whackBackLine('Rty'), whackRowMark('Dagit')].join(' '))
      .not.toMatch(/\b(charge|token|AGI|STR|MND)\b/i);
  });
});
