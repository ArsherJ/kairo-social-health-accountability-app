import { expect, it } from 'vitest';
import { INVITE_HOST } from '../squad/invite-link.ts';
import { BEST_DAY_COPY, bestDayShareText } from './share-copy.ts';

it('shares only the selected day, its human stat name and the landing link', () => {
  for (const voice of ['en', 'tl-en'] as const) {
    const text = bestDayShareText({ stat: 'AGI', value: 12540, localDate: '2026-09-08' }, voice);
    expect(text).toContain('Motion');
    expect(text).toContain('12,540 steps');
    expect(text).toContain('8 Sep');
    expect(text).toContain(`https://${INVITE_HOST}`);
    expect(text).not.toMatch(/\b(AGI|STR|MND|Mastery|record)\b/);
  }
  expect(Object.values(BEST_DAY_COPY).join(' ')).not.toMatch(/\bMastery\b/);
});
