import { Share } from 'react-native';
import type { StatRecord } from './records.ts';
import { bestDayShareText } from './share-copy.ts';

export async function shareBestDay(
  record: StatRecord,
  voice: 'en' | 'tl-en' = 'en',
): Promise<void> {
  await Share.share({ message: bestDayShareText(record, voice) });
}
