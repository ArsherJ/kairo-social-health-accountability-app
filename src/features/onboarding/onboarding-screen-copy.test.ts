import { CHARACTER_NAME_MAX, FREE_SQUAD_MAX_MEMBERS, RACE_FINISH_LINE } from '@kairo/core';
import { describe, expect, it } from 'vitest';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(strings);
}

describe('shared onboarding screen copy', () => {
  it('keeps engine-owned figures attached to their source constants', async () => {
    const { ONBOARDING_SCREEN_COPY: copy } = await import('./onboarding-screen-copy.ts');

    expect(copy.welcome.freeSquadMaxMembers).toBe(FREE_SQUAD_MAX_MEMBERS);
    expect(copy.oneSky.finishLine).toBe(RACE_FINISH_LINE);
    expect(copy.name.maxLength).toBe(CHARACTER_NAME_MAX);
    expect(copy.connect.readingLabel(1_234)).toBe('1,234 steps today, already counted');
    expect(copy.name.portraitLabel('Philippine Eagle')).toBe('Your Philippine Eagle Kairo');
  });

  it('states the whole Health ask on the screen that is about the ask', async () => {
    // The intro said Kairo reads "your steps". It reads steps, active calories
    // and sleep; the locked row beneath and Apple's own sheet both say so, and
    // an intro that understates the ask on the privacy beat is a trust problem
    // rather than a shortening. What is *read*, not what is shared — the claim
    // module owns sharing, and this sentence must trip none of its markers.
    const { ONBOARDING_SCREEN_COPY: copy } = await import('./onboarding-screen-copy.ts');
    expect(copy.privacy.intro).toContain('steps, active calories and sleep');
  });

  it('speaks only the current surface vocabulary', async () => {
    const { ONBOARDING_SCREEN_COPY: copy } = await import('./onboarding-screen-copy.ts');
    const text = [
      ...strings(copy),
      copy.connect.readingLabel(1_234),
      copy.privacy.requiredLabel(copy.privacy.healthTitle),
      copy.name.help('Philippine Eagle'),
      copy.name.portraitLabel('Philippine Eagle'),
    ].join(' ');

    expect(text).not.toMatch(/\b(AGI|STR|MND|END|VIT|REC)\b/);
    expect(text).not.toMatch(/\b(Bronze|Silver|Gold|Mastery|battle|boss|token)\b/i);
  });
});
