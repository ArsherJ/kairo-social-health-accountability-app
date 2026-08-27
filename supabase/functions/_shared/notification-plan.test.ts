import { describe, expect, it } from 'vitest';
import { DIGEST_HOUR, planDigest, type DispatchUser } from './notification-plan.ts';

const manila: DispatchUser = {
  userId: 'u-manila',
  localDate: '2026-08-26',
  timeZone: 'Asia/Manila',
};
const newYork: DispatchUser = {
  userId: 'u-ny',
  localDate: '2026-08-25',
  timeZone: 'America/New_York',
};

describe('DIGEST_HOUR', () => {
  it('is the morning, not the finalization moment', () => {
    // Days finalize roughly two hours after each user's local midnight, so a
    // digest carrying the finalized result would fire at about 2am. The two are
    // decoupled deliberately (spec §4.2): finalize-days writes the result when
    // the day closes, and this sends it when the user is awake.
    expect(DIGEST_HOUR).toBe(8);
  });

  it('is outside quiet hours, which is what lets it need no exemption', () => {
    expect(DIGEST_HOUR).toBeGreaterThanOrEqual(7);
    expect(DIGEST_HOUR).toBeLessThan(22);
  });
});

describe('planDigest', () => {
  it('carries yesterday as the result and today as the standing', () => {
    const [candidate] = planDigest({ hour: DIGEST_HOUR, users: [manila] });
    expect(candidate!.trigger).toBe('daily_digest');
    expect(candidate!.data.resultDate).toBe('2026-08-25');
    expect(candidate!.data.standingDate).toBe('2026-08-26');
    // The budget bucket is always the day the recipient is living in.
    expect(candidate!.data.sendDate).toBe('2026-08-26');
  });

  it('emits nothing on the other twenty-three hours', () => {
    // The cron still fires on all of them, so this is the normal path, not an
    // error.
    for (const hour of [0, 7, 9, 23]) {
      expect(planDigest({ hour, users: [manila] })).toEqual([]);
    }
  });

  it('emits one candidate per user and no more', () => {
    const candidates = planDigest({ hour: DIGEST_HOUR, users: [manila, newYork] });
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.userId)).toEqual([manila.userId, newYork.userId]);
  });

  it("carries each user's own timezone and their own dates", () => {
    const candidates = planDigest({ hour: DIGEST_HOUR, users: [manila, newYork] });
    expect(candidates.map((c) => c.data.timeZone)).toEqual([
      'Asia/Manila',
      'America/New_York',
    ]);
    // Two members of one squad, at their own 08:00, are on different dates.
    expect(candidates.map((c) => c.data.resultDate)).toEqual(['2026-08-25', '2026-08-24']);
  });

  it('crosses a month boundary correctly', () => {
    const [candidate] = planDigest({
      hour: DIGEST_HOUR,
      users: [{ ...manila, localDate: '2026-09-01' }],
    });
    expect(candidate!.data.resultDate).toBe('2026-08-31');
  });

  it('emits nothing for nobody', () => {
    expect(planDigest({ hour: DIGEST_HOUR, users: [] })).toEqual([]);
  });
});

describe('purity', () => {
  it('preserves user order and does not mutate the input', () => {
    const users = [manila, newYork];
    const snapshot = JSON.parse(JSON.stringify(users)) as DispatchUser[];
    planDigest({ hour: DIGEST_HOUR, users });
    expect(users).toEqual(snapshot);
  });
});
