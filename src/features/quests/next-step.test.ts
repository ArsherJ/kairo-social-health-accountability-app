import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestState } from '@kairo/core';
import { nextStepSentence, questCategory, selectNextStep } from './next-step.ts';
import type { TodayQuest } from './queries.ts';

function entry(metric: QuestDef['metric'], fraction: number, met = false): TodayQuest {
  const target = metric === 'distance_m' ? 5_000 : metric === 'active_hours' ? 4 : 1_000;
  return {
    quest: { id: `q-${metric}`, tier: 'starter', metric, target, xp: 10 },
    state: { value: met ? target : Math.round(target * fraction), fraction, met } as QuestState,
  };
}

describe('selectNextStep', () => {
  it('prefers an opted-in Body quest over a nearer Motion quest', () => {
    const quests = [entry('steps', 0.9), entry('active_kcal', 0.2), entry('distance_m', 0.8)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: true })).toMatchObject({
      kind: 'quest', index: 1, category: 'body',
    });
  });

  it('otherwise chooses the nearest incomplete quest across Motion and Body', () => {
    const quests = [entry('steps', 0.4), entry('active_kcal', 0.95), entry('distance_m', 0.8)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: false })).toMatchObject({
      kind: 'quest', index: 1, category: 'body',
    });
  });

  it('counts active hours as Motion, since the engine treats them as an AGI shift', () => {
    expect(questCategory('active_hours')).toBe('motion');
    expect(questCategory('steps')).toBe('motion');
    expect(questCategory('distance_m')).toBe('motion');
    expect(questCategory('active_kcal')).toBe('body');
    expect(questCategory('sleep_minutes')).toBe('mind');
  });

  it('filters completed quests and immutable Mind observations', () => {
    const quests = [entry('sleep_minutes', 0.9), entry('steps', 0.2, true), entry('active_kcal', 0.3)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: false })).toMatchObject({
      kind: 'quest', index: 2, category: 'body',
    });
  });

  it('uses stable quest order to break equal fractions', () => {
    const quests = [entry('steps', 0.5), entry('distance_m', 0.5), entry('active_kcal', 0.1)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: false })).toMatchObject({ index: 0 });
  });

  it('gives permission to stop when nothing actionable remains', () => {
    const quests = [entry('steps', 1, true), entry('active_kcal', 1, true), entry('sleep_minutes', 0.4)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: true })).toEqual({ kind: 'rest' });
  });
});

describe('nextStepSentence', () => {
  it('uses raw units and never exposes XP, tiers, or engine keys', () => {
    const selected = selectNextStep({ quests: [entry('steps', 0.4)], strengthChallengeOptedIn: false });
    const line = nextStepSentence(selected, 'Dagit');
    expect(line).toContain('Dagit');
    expect(line).toMatch(/steps/i);
    expect(line).not.toMatch(/XP|bronze|silver|gold/i);
    expect(line).not.toMatch(/\b(AGI|STR|MND)\b/);
  });

  it('makes rest companionship explicit without guilt', () => {
    expect(nextStepSentence({ kind: 'rest' }, 'Dagit')).toBe(
      'You have done what can be changed today. Dagit can rest with you.',
    );
  });
});
