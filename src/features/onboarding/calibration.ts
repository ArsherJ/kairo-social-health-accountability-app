import {
  calibrateQuestTier,
  calibrationWindow,
  currentLocalDate,
  previousDay,
  type QuestCalibration,
} from '@kairo/core';
import { healthSource } from '../health/health-source.ts';
import { deviceTimeZone } from '../profile/device-timezone.ts';
import { hasReached, markReached, markUnreached } from '../telemetry/milestone-store.ts';
import { track } from '../telemetry/events.ts';

/**
 * Read the phone and propose a starting quest size (deviation #63).
 *
 * The five steps in order: pick the window, read it, judge it, report the
 * outcome, hand back the proposal. Every decision in the middle is
 * `calibrateQuestTier` in the keystone; this module is the I/O and the clock,
 * which is the same split `connect-health.ts` makes and for the same reason.
 *
 * **The window ends yesterday**, always. Calibration runs seconds after the
 * Health grant and the grant is usually taken mid-morning, so today is a
 * fraction of a day and would drag the median down by roughly half a band —
 * proposing Starter to a Steady walker because they were asked at 10am.
 *
 * **The device zone stands in for the profile's**, because there is no profile
 * row yet and therefore no `profiles.timezone`; that is the same substitution
 * `/connect`'s step reveal already makes, and for the same reason it is safe —
 * nothing here is stored, so a zone that turns out to be wrong costs one
 * proposal the player can change, not a mis-keyed day.
 *
 * **It never throws, and never waits on the network.** A read that fails and a fortnight with nothing in it are
 * the same answer here: we have not seen enough to say. HealthKit does not
 * report a read-permission denial, so the app could not tell the two apart even
 * if it wanted to — and the surface says nothing that depends on which it was.
 */
export async function runCalibration(userId: string | undefined): Promise<QuestCalibration> {
  const timeZone = deviceTimeZone();
  const window = calibrationWindow(previousDay(currentLocalDate(new Date(), timeZone)));

  const calibration = await healthSource
    .readDailySteps(window, timeZone)
    .then(calibrateQuestTier)
    .catch((): QuestCalibration => ({ outcome: 'no-history' }));

  // Fire-and-forget, and **not awaited**: the connect beat gates its hatch on
  // this promise, so blocking it on a telemetry round trip would hold a card up
  // on somebody's network. `.catch` because the marker store is the one thing
  // in here that can throw, and an unhandled rejection is not a price a
  // measurement gets to charge.
  void recordOutcome(userId, calibration).catch(() => {});
  return calibration;
}

/**
 * Report *that* a reading happened and how it landed — never what it said.
 *
 * `{ outcome }` and nothing else. The proposed tier is deliberately absent as
 * well as the median: the question this answers is whether calibration works at
 * all — what fraction of new accounts it can read — and a tier breakdown would
 * be a distribution of the cohort's fitness sitting in `app_events` to answer a
 * question nobody asked. The payload lives here rather than at the call site so
 * "the outcome and nothing else" is true by construction, which is the argument
 * `useBeatImpression` already makes about the beat's route.
 *
 * **Once ever**, on an MMKV marker, because the reading itself is not: backing
 * up to `/connect` and granting again re-runs it, and a second row would make
 * the denominator count taps. The marker is claimed *before* the write and
 * released if the row did not land — the same race `first_sync_seen` guards,
 * where marking an event sent when it was not suppresses every retry.
 */
async function recordOutcome(
  userId: string | undefined,
  calibration: QuestCalibration,
): Promise<void> {
  if (!userId || hasReached(userId, 'calibration_recorded')) return;

  markReached(userId, 'calibration_recorded');
  const landed = await track(userId, 'calibration_completed', {
    outcome: calibration.outcome,
  });
  if (!landed) markUnreached(userId, 'calibration_recorded');
}
