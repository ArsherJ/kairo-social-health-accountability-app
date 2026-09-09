import { describe, expect, it } from 'vitest';
import { previewMembers } from './preview-data.ts';
import { PREVIEW_COPY, PREVIEW_TABS, previewReadings } from './preview-copy.ts';

describe('isolated screen fixtures', () => {
  it('keeps private members present without inventing zero readings', () => {
    const ready = previewMembers('ready');
    const privateRows = previewMembers('withheld');
    expect(privateRows.map((row) => row.user_id)).toEqual(ready.map((row) => row.user_id));
    expect(privateRows.every((row) => row.steps === null && row.active_kcal === null)).toBe(true);
    expect(ready.some((row) => row.steps !== null)).toBe(true);
  });
  it('shows one unranked self in the empty flock', () => {
    const rows = previewMembers('empty');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ is_self: true, steps: 0 });
    expect(previewReadings(0, 0)).toBe('0 steps · 0 active kcal');
  });
  it('keeps the four-tab contract and labels sample data explicitly', () => {
    expect(PREVIEW_TABS.map((tab) => tab.label)).toEqual(['Today', 'Sky', 'Flock', 'You']);
    expect(PREVIEW_COPY.sample).toContain('Sample data');
    expect(Object.values(PREVIEW_COPY).join(' ')).not.toMatch(
      /\b(AGI|STR|MND|Mastery|battle|boss)\b/,
    );
  });
});
