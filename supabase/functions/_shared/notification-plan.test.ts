import { describe, expect, it } from 'vitest';
import {
  DISPATCH_HOURS,
  planHourlyDispatch,
  type DispatchUser,
} from './notification-plan.ts';

const manila: DispatchUser = {
  userId: 'u-manila',
  localDate: '2026-08-08',
  timeZone: 'Asia/Manila',
};
const newYork: DispatchUser = {
  userId: 'u-ny',
  localDate: '2026-08-07',
  timeZone: 'America/New_York',
};

describe('which trigger an hour carries', () => {
  it('maps the three MVP hours and nothing else', () => {
    expect(DISPATCH_HOURS).toEqual({ 0: 'day_ends', 9: 'day_starts', 23: 'day_ending_soon' });
  });

  it('produces nothing for an hour that carries no trigger', () => {
    // The cron fires every hour; twenty-one of the twenty-four are no-ops, and
    // that has to be a quiet return rather than an error.
    expect(planHourlyDispatch({ hour: 14, users: [manila] })).toEqual([]);
  });
});

describe('the date a notification is about', () => {
  it('is today for day_starts and day_ending_soon', () => {
    expect(planHourlyDispatch({ hour: 9, users: [manila] })[0]!.data.aboutDate).toBe(
      '2026-08-08',
    );
    expect(planHourlyDispatch({ hour: 23, users: [manila] })[0]!.data.aboutDate).toBe(
      '2026-08-08',
    );
  });

  it('buckets the send against the date the user is living in, not the date it is about', () => {
    // notification_log.local_date is the budget bucket, and the budget resets
    // when the recipient's day does. At local hour 0 the day just reset, so a
    // "Day ends" push is the first of the NEW day's three — logging it against
    // the day it describes would spend a budget that is already closed.
    const [candidate] = planHourlyDispatch({ hour: 0, users: [manila] });
    expect(candidate!.data.sendDate).toBe('2026-08-08');
    expect(candidate!.data.aboutDate).toBe('2026-08-07');
  });

  it('is yesterday for day_ends, because local midnight has already passed', () => {
    // users_at_local_hour reports the date the user is now LIVING in. At local
    // hour 0 that is the new day; the day whose result the push announces is the
    // one before it. Getting this backwards announces a day that has no score.
    const [candidate] = planHourlyDispatch({ hour: 0, users: [manila] });
    expect(candidate!.data.aboutDate).toBe('2026-08-07');
  });

  it('carries each user\'s own timezone through', () => {
    const candidates = planHourlyDispatch({ hour: 9, users: [manila, newYork] });
    expect(candidates.map((c) => c.data.timeZone)).toEqual([
      'Asia/Manila',
      'America/New_York',
    ]);
  });
});

describe('day_starts is conditional', () => {
  it('is dropped for a user who already opened the app today', () => {
    // §14: mid-morning, "only if the app hasn't been opened yet". Sending it to
    // someone already looking at the screen is the definition of noise.
    const candidates = planHourlyDispatch({
      hour: 9,
      users: [manila, newYork],
      openedApp: [manila.userId],
    });
    expect(candidates.map((c) => c.userId)).toEqual([newYork.userId]);
  });

  it('does not gate the other triggers on app opens', () => {
    for (const hour of [0, 23]) {
      const candidates = planHourlyDispatch({
        hour,
        users: [manila],
        openedApp: [manila.userId],
      });
      expect(candidates.map((c) => c.userId)).toEqual([manila.userId]);
    }
  });
});

describe('purity', () => {
  it('preserves user order and does not mutate the input', () => {
    const users = [manila, newYork];
    const snapshot = JSON.parse(JSON.stringify(users)) as DispatchUser[];
    const candidates = planHourlyDispatch({ hour: 23, users });
    expect(candidates.map((c) => c.userId)).toEqual([manila.userId, newYork.userId]);
    expect(users).toEqual(snapshot);
  });
});
