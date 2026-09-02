import { describe, expect, it } from 'vitest';
import { RACE_FINISH_LINE } from '@kairo/core';
import { skyReading } from './sky-reading.ts';

const self = { isSelf: true };
// A ghost and a squadmate are the same shape here on purpose: the corridor
// holds a racer either way, and the count is the whole question. See
// `SkyRacerFacts` for why there is no `isGhost` to pass.
const ghost = { isSelf: false };
const squadmate = { isSelf: false };

describe('what the Sky says when a player is alone on it', () => {
  it('offers the solo reading to a lone racer', () => {
    const reading = skyReading([self], false);

    expect(reading.raceExists).toBe(false);
    expect(reading.solo).not.toBeNull();
  });

  it('names the ridge as the opponent, so a day alone is a complete reading', () => {
    // The corridor still draws. The ridge is a real opponent — it *is*
    // `DAILY_STEP_BASELINE`, flat and permanent — so the screen has something
    // true to say rather than an absence to apologise for.
    const solo = skyReading([self], false).solo!;

    expect(solo.observation).toMatch(/ridge/i);
    expect(solo.observation).toContain(RACE_FINISH_LINE.toLocaleString());
  });

  it('puts the invitation where the rivals would be', () => {
    // The offer is the sentence and its control together — the sentence says
    // why, the control says what. Asserted across both rather than on either,
    // so the copy can move between them without the guard going quiet.
    const solo = skyReading([self], true).solo!;

    expect(`${solo.invitation} ${solo.action}`).toMatch(/invite|someone|friend/i);
    expect(solo.action.length).toBeGreaterThan(0);
  });

  it('shares the squad\'s own invite when there is one to share', () => {
    // The same message and share sheet the Flock tab produces. The code, the
    // link and the copy are one behaviour and must not fork, which is why this
    // says *which* action rather than carrying copy of its own.
    expect(skyReading([self], true).solo!.intent).toBe('share');
  });

  it('offers a flock, not an invite, to somebody who has no squad', () => {
    // There is no code to share yet, and "invite a friend" with nothing to
    // invite them to would be one more surface promising something absent.
    const solo = skyReading([self], false).solo!;

    expect(solo.intent).toBe('flock');
    expect(solo.action).not.toMatch(/invite/i);
  });

  it('says nothing to a racer with ghosts — that behaviour is unchanged', () => {
    // A player with scored history races their own past days. Ghosts are a real
    // race, so there is nothing missing to offer.
    const reading = skyReading([self, ghost, ghost], false);

    expect(reading.raceExists).toBe(true);
    expect(reading.solo).toBeNull();
  });

  it('says nothing to a racer with squadmates', () => {
    const reading = skyReading([self, squadmate], true);

    expect(reading.raceExists).toBe(true);
    expect(reading.solo).toBeNull();
  });

  it('names no rank anywhere, because there is nobody to be ahead of', () => {
    // The app must not congratulate somebody for beating nobody. Word-bounded
    // and case-insensitive over ordinary English: a loose /st/ would fire on
    // "steps", which this copy legitimately wants.
    const solo = skyReading([self], false).solo!;

    const soloInSquad = skyReading([self], true).solo!;
    for (const line of [
      solo.observation,
      solo.invitation,
      solo.action,
      soloInSquad.invitation,
      soloInSquad.action,
    ]) {
      expect(line).not.toMatch(/\b(1st|first|rank|ranked|place|leading|ahead of)\b/i);
    }
  });

  it('invents no rival — every line is about the reader and the ridge', () => {
    // Nothing on the corridor may be a person who does not exist. The module
    // produces copy and never a racer, so this is a contract on its shape as
    // much as on its words: there is no racer-shaped field to fill.
    const solo = skyReading([self], false).solo as unknown as Record<string, unknown>;

    expect(Object.keys(solo).sort()).toEqual([
      'action',
      'intent',
      'invitation',
      'observation',
    ]);
  });

  it('reads an empty list as alone rather than crashing', () => {
    // The board is empty for a frame while the queries are in flight, and a
    // screen that throws on its own loading state is worse than one that shows
    // an invitation a moment early.
    expect(skyReading([], false).raceExists).toBe(false);
    expect(skyReading([], false).solo).not.toBeNull();
  });
});
