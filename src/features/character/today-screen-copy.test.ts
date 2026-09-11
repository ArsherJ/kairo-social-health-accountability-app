import { expect, it } from 'vitest';
import { TODAY_SCREEN_COPY } from './today-screen-copy.ts';
it('keeps Today about the present day', () => {
  expect(Object.values(TODAY_SCREEN_COPY).join(' ')).not.toMatch(
    /\b(AGI|STR|MND|Mastery|record|battle|boss)\b/i,
  );
});
