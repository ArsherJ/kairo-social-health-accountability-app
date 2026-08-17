import { useEffect } from 'react';
import {
  DISCLOSURE_THRESHOLD_DAYS,
  disclosureStage,
  type DisclosureStage,
} from '@kairo/core';
import { track } from '@/features/telemetry/events.ts';
import {
  hasReached,
  markReached,
  markUnreached,
} from '@/features/telemetry/milestone-store.ts';
import { useScoredDayCount } from './queries.ts';

/**
 * What the app is allowed to show this account, and how close it is.
 *
 * The decision itself is `disclosureStage` in `@kairo/core`, tested in Node.
 * This is the I/O around it — the same split `useHealthSync` and
 * `useSquadRealtime` use.
 *
 * **While the count is loading the stage is `'core'`.** Showing less and then
 * revealing more is a reveal; showing everything and then snatching it back is
 * a bug the user will report. The undercount lasts one query.
 *
 * Called from several surfaces at once (the home screen, `/train`, `/goal/new`,
 * `SquadGoalPanel`). That costs one request, not four: every call resolves to
 * the same TanStack key, so the query is shared and the gate cannot disagree
 * with itself between two screens in the same frame.
 */
export function useDisclosure(userId: string | undefined): {
  stage: DisclosureStage;
  scoredDays: number;
  daysToGo: number;
} {
  const count = useScoredDayCount(userId);
  const scoredDays = count.data ?? 0;
  const stage = disclosureStage(scoredDays);

  useEffect(() => {
    if (!userId) return;
    // Gated on the query having actually resolved: `scoredDays` defaults to 0
    // while loading, and firing off a default would record an unlock that never
    // happened.
    if (count.data === undefined) return;
    if (stage !== 'full') return;

    try {
      if (hasReached(userId, 'disclosure_unlocked')) return;
      markReached(userId, 'disclosure_unlocked');
    } catch (error) {
      console.warn('[disclosure] milestone read failed', error);
      return;
    }

    // Claim before the write, release if the row did not land — the same
    // protocol `markFirstSyncSeen` settled on. `track` resolves true only on a
    // confirmed insert. Releasing means a write that succeeded but reported
    // failure could fire twice; every query reading this counts distinct users,
    // so a duplicate changes no answer and a lost unlock is unrecoverable.
    void track(userId, 'disclosure_unlocked', { scoredDays }).then((landed) => {
      if (landed) return;
      try {
        markUnreached(userId, 'disclosure_unlocked');
      } catch (error) {
        console.warn('[disclosure] milestone release failed', error);
      }
    });
  }, [userId, stage, count.data, scoredDays]);

  return {
    stage,
    scoredDays,
    daysToGo: Math.max(0, DISCLOSURE_THRESHOLD_DAYS - scoredDays),
  };
}
