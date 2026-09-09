import { expect, it } from 'vitest';
import { RACE_FINISH_LINE } from '@kairo/core';
import { SKY_SCREEN_COPY } from './sky-screen-copy.ts';
it('describes the shared finish line in real units', () => {
  expect(SKY_SCREEN_COPY.explanation).toContain(RACE_FINISH_LINE.toLocaleString('en-US'));
  expect(Object.values(SKY_SCREEN_COPY).join(' ')).not.toMatch(/\b(AGI|STR|MND|boss|battle)\b/i);
});
