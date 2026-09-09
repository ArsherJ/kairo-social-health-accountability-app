import type { CoreStat } from '@kairo/core';
import { STAT_NAMES } from '../../ui/stat-names.ts';
import { INVITE_HOST } from '../squad/invite-link.ts';
import { recordDate, recordValue } from './record-copy.ts';

export const BEST_DAY_COPY = {
  title: 'Your best days',
  note: 'Little moments. Look how far they go.',
  share: 'Share',
  loading: 'Finding your best days…',
  error: 'Your best days couldn’t load.',
  retry: 'Try again',
  shareError: 'Couldn’t open sharing. Please try again.',
} as const;

export function bestDayShareText(
  record: { stat: CoreStat; value: number; localDate: string },
  voice: 'en' | 'tl-en' = 'en',
): string {
  const best = `${recordValue(record.stat, record.value)} · ${
    recordDate(record.localDate, undefined)
  }`;
  return `${voice === 'tl-en' ? 'Best day ko sa Kairo' : 'My best day on Kairo'}: ${
    STAT_NAMES[record.stat]
  } — ${best}.\nhttps://${INVITE_HOST}`;
}
