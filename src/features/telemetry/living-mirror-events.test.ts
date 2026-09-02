import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const today = readFileSync('app/(tabs)/index.tsx', 'utf8');
const events = readFileSync('src/features/telemetry/events.ts', 'utf8');

describe('Living Mirror telemetry', () => {
  it.each(['today_seen', 'today_details_opened', 'next_step_shown', 'character_reaction_seen'])
    ('declares and emits %s', (name) => {
      expect(events).toContain(`'${name}'`);
      expect(today).toContain(`'${name}'`);
    });

  it('never sends raw health or stable identity fields', () => {
    expect(today).not.toMatch(/track\([^)]*(steps|distanceM|activeKcal|sleepMinutes|verifiedMinutes|occurrence|quest\.id)/s);
  });

  // A five-band Motion location is a coarse step count, so it is a raw health
  // figure in a different dress. `quest_cleared` sets the precedent: it carries
  // `{ tier }` and never a quest id.
  it('never sends the Motion location with a reaction impression', () => {
    expect(today).not.toMatch(/track\([^)]*location/s);
    expect(today).not.toMatch(/character_reaction_seen[^)]*location/s);
  });
});
