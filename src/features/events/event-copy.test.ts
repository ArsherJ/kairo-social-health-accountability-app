import { describe, expect, it } from 'vitest';
import type {
  EventProgress,
  KairoEvent,
} from '../../../packages/kairo-core/src/event.ts';
import {
  deadlineLine,
  eventHeadline,
  eventLabel,
  eventStatusLine,
  eventWindowLine,
  fillFraction,
  paceFraction,
  shortDate,
} from './event-copy.ts';

const battle: KairoEvent = {
  id: 'e1',
  kind: 'battle',
  metric: 'active_kcal',
  target: 3_000,
  startsOn: '2026-09-01',
  endsOn: '2026-09-07',
};

const progress = (over: Partial<EventProgress> = {}): EventProgress => ({
  progress: 0,
  finalProgress: 0,
  target: 3_000,
  fraction: 0,
  daysRemaining: 7,
  daysUnresolved: 7,
  expired: false,
  onPace: true,
  met: false,
  ...over,
});

describe('eventHeadline', () => {
  it('names the bar in the unit the squad produces', () => {
    expect(eventHeadline(battle)).toBe('3,000 kcal to beat');
  });

  it('says an adventure in kilometres', () => {
    expect(
      eventHeadline({ ...battle, kind: 'adventure', metric: 'distance_m', target: 42_000 }),
    ).toBe('42 km to cover');
  });

  it('keeps one decimal on a distance that is not a whole kilometre', () => {
    expect(
      eventHeadline({ ...battle, kind: 'adventure', metric: 'distance_m', target: 7_500 }),
    ).toBe('7.5 km to cover');
  });
});

describe('eventStatusLine', () => {
  it('leads with how far in, then how long is left', () => {
    expect(eventStatusLine(progress({ progress: 1_200, fraction: 0.4, daysRemaining: 4 }))).toBe(
      '1,200 of 3,000 · 4 days left',
    );
  });

  it('says one day, singular, on the last day', () => {
    expect(eventStatusLine(progress({ progress: 2_000, daysRemaining: 1 }))).toMatch(/1 day left/);
  });

  it('says behind pace, because that is the one actionable state', () => {
    expect(eventStatusLine(progress({ progress: 100, daysRemaining: 2, onPace: false }))).toBe(
      '100 of 3,000 · behind pace, 2 days left',
    );
  });

  it('never says on pace, which is a verdict rather than an instruction', () => {
    expect(eventStatusLine(progress({ progress: 900, daysRemaining: 5 }))).not.toMatch(/on pace/);
  });

  it('leads with the win once it is won, and never mentions pace again', () => {
    expect(eventStatusLine(progress({ met: true, progress: 3_400, fraction: 1 }))).toBe('Beaten');
  });

  it('says it plainly when the window closed short', () => {
    expect(eventStatusLine(progress({ expired: true, progress: 900, daysRemaining: 0 }))).toBe(
      '900 of 3,000 · time up',
    );
  });

  it('states a distance event in kilometres, not in metres', () => {
    expect(
      eventStatusLine(progress({ progress: 12_000, target: 42_000, daysRemaining: 3 }), {
        metric: 'distance_m',
      }),
    ).toBe('12 km of 42 km · 3 days left');
  });
});

describe('eventLabel', () => {
  it('is one utterance: what it is, where it stands', () => {
    expect(eventLabel('The Carabao', battle, progress({ progress: 1_200, daysRemaining: 4 }))).toBe(
      'The Carabao. 3,000 kcal to beat. 1,200 of 3,000 · 4 days left.',
    );
  });
});

describe('eventWindowLine', () => {
  it('states the span and its length', () => {
    expect(eventWindowLine(battle, '2026-09-03')).toBe('1 Sep – 7 Sep · 7 days');
  });

  it('carries the year when the window leaves it', () => {
    expect(eventWindowLine({ ...battle, endsOn: '2027-01-05' }, '2026-09-03')).toContain('2027');
  });
});

describe('deadlineLine', () => {
  it('counts toward a deadline still ahead', () => {
    expect(deadlineLine('2026-09-07', '2026-09-03')).toBe('by 7 Sep');
  });

  it('says a window is behind us in the past tense', () => {
    expect(deadlineLine('2026-09-07', '2026-09-30')).toBe('ended 7 Sep');
  });
});

describe('fillFraction and paceFraction', () => {
  it('clamps the fill so an overshoot cannot draw wider than its track', () => {
    expect(fillFraction(progress({ progress: 9_000, fraction: 1 }))).toBe(1);
  });

  it('marks where the fill should have reached by today', () => {
    // 3 of 7 days elapsed.
    expect(paceFraction(progress({ daysRemaining: 4 }), 7)).toBeCloseTo(3 / 7);
  });

  it('draws no marker before the window opens, after it closes, or once beaten', () => {
    expect(paceFraction(progress({ daysRemaining: 7 }), 7)).toBeNull();
    expect(paceFraction(progress({ daysRemaining: 0, expired: true }), 7)).toBeNull();
    expect(paceFraction(progress({ met: true, daysRemaining: 4 }), 7)).toBeNull();
  });
});

describe('shortDate', () => {
  it('drops the year inside the current one and keeps it outside', () => {
    expect(shortDate('2026-01-31', '2026-09-03')).toBe('31 Jan');
    expect(shortDate('2027-01-31', '2026-09-03')).toBe('31 Jan 2027');
  });
});
