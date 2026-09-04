import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A source scan, on `telemetry-payloads.test.ts`'s precedent and for its
 * reason: the emitting component is a `.tsx` reaching React Native, which root
 * Vitest cannot load, and the claim being made is about what a payload may
 * carry rather than about a return value.
 */
const asks = readFileSync('src/features/permissions/PermissionAsks.tsx', 'utf8');
const events = readFileSync('src/features/telemetry/events.ts', 'utf8');

describe('the notification ask answer', () => {
  it('is declared as an event type', () => {
    expect(events).toContain("'notification_ask_answered'");
  });

  it('is recorded on both the system answer and the deferral', () => {
    // Two call sites, because "Not now" never reaches the system dialog and so
    // is a third answer rather than the absence of one. Per answer, not once
    // ever: the dismissal is per-session and a deferral can genuinely recur.
    expect(asks.match(/notification_ask_answered/g) ?? []).toHaveLength(2);
  });

  it('takes the system answer from the one function that names it', () => {
    // `NotificationAskAnswer` and `askAnswerFor` are typechecked, so the two
    // dialog answers need no scan. This asserts only that the component reaches
    // for them rather than re-deriving the mapping — which it did, in a second
    // vocabulary, until this test existed.
    expect(asks).toContain('askAnswerFor(result)');
  });

  it('says deferred for a dismissal, which is the one answer iOS never sees', () => {
    // "Not now" never reaches the system dialog, so there is no permission to
    // map: this is the only answer written as a literal, and the only one that
    // can recur.
    expect(asks).toContain("answer: 'deferred'");
  });

  it('carries no other payload', () => {
    // The widening is judged on grant rate alone. Nothing about *why* the ask
    // became eligible may ride along: `hasScoredDay` is a health fact, and a
    // squad id names other accounts.
    const calls = asks.match(/notification_ask_answered[^;]*/gs) ?? [];
    expect(calls).not.toHaveLength(0);
    for (const call of calls) {
      expect(call).not.toMatch(/hasScoredDay|hasSquad|hasEvent|userId:|squad|steps|scoredDay/i);
      expect(call.match(/\w+:/g) ?? []).toEqual(['answer:']);
    }
  });
});
