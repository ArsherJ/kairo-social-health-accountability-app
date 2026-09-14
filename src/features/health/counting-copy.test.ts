import { describe, expect, it } from 'vitest';
import { HOURLY_CEILINGS, RACE_FINISH_LINE } from '@kairo/core';
import { COUNTING_COPY } from './counting-copy.ts';

/**
 * The one screen that tells a player how their activity becomes Kairo's
 * figures. Held by a test for the reason the privacy claim is: copy that
 * explains a rule drifts from the rule, and this is the surface a player
 * reaches from "aren't counted yet" or a flag, when a wrong sentence costs
 * the most.
 */
const text = [
  COUNTING_COPY.title,
  COUNTING_COPY.standfirst,
  ...COUNTING_COPY.sections.flatMap((s) => [s.title, s.body]),
].join('\n');

describe('the counting copy', () => {
  it('names the ridge from the constant, never a literal', () => {
    expect(text).toContain(`${RACE_FINISH_LINE.toLocaleString('en-US')} steps`);
  });

  it('says what a flag is, what it costs and that it ends with the day', () => {
    const flag = COUNTING_COPY.sections.find((s) => s.title === 'What a flag means')!.body;
    expect(flag).toMatch(/human movement/);
    expect(flag).toMatch(/personal best/);
    expect(flag).toMatch(/flock/);
    expect(flag).toMatch(/that day only/);
    expect(flag).toMatch(/tomorrow starts clean/i);
  });

  it('never publishes the bar an hour is judged against', () => {
    // The one reader with a motive to know the per-hour ceilings is the one
    // sitting just under them (`docs/engineering/health-ingest.md`). The
    // figures are banned formatted and bare, and so are the words that would
    // invite a reader to go looking for them.
    for (const figure of Object.values(HOURLY_CEILINGS)) {
      expect(text).not.toContain(figure.toLocaleString('en-US'));
      expect(text).not.toContain(String(figure));
    }
    expect(text.toLowerCase()).not.toMatch(/ceiling|threshold|per hour|an hour can/);
  });

  it('speaks no engine key', () => {
    expect(text).not.toMatch(/\b(AGI|STR|MND|END|VIT|REC)\b/);
  });

  it('states the exclusions and never accuses', () => {
    // The same ban `today-details.test.ts` holds the dropped-sources line to.
    // A cheap band that writes under its own identifier is not counted yet,
    // and the owner of that band is not a suspect.
    const lower = text.toLowerCase();
    for (const word of ['cheat', 'invalid', 'not allowed', 'rejected', 'untrusted', 'suspicious', 'blocked']) {
      expect(lower, `the copy accuses: ${word}`).not.toContain(word);
    }
  });

  it('makes no privacy claim of its own, so it stays outside the sweep', () => {
    // `claim-surfaces.test.ts` recognises a claim by these markers and bans
    // any file outside `claim-copy.ts` that carries one. This screen is about
    // counting, not sharing; the one sentence it shares with the policy —
    // that Kairo never writes to Health — is a fact about the read.
    expect(text).not.toMatch(/hour-by-hour|never your route|both agreed|raw numbers|daily totals/i);
    expect(text).toMatch(/never writes/);
  });
});
