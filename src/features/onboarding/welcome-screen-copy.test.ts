import { expect, it } from 'vitest';
import { FREE_SQUAD_MAX_MEMBERS } from '@kairo/core';
import { WELCOME_SCREEN_COPY } from './welcome-screen-copy.ts';
it('introduces a solo-first flock without promising unbuilt rewards', () => {
  expect(WELCOME_SCREEN_COPY.flockBody).toContain(String(FREE_SQUAD_MAX_MEMBERS));
  expect(Object.values(WELCOME_SCREEN_COPY).join(' ')).not.toMatch(
    /\b(AGI|STR|MND|Mastery|battle|boss|token)\b/i,
  );
});
