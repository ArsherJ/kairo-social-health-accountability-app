import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_NAME_MAX } from '../../../packages/kairo-core/src/profile.ts';

const source = readFileSync(
  new URL('./FlockPerch.tsx', import.meta.url),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('FlockPerch name layout', () => {
  it('lets the domain-maximum name widen and wrap without a line clamp', () => {
    expect(CHARACTER_NAME_MAX).toBe(20);
    expect(source).toMatch(/minWidth:\s*96/);
    expect(source).not.toMatch(/\bwidth:\s*96/);
    expect(source).toMatch(/maxWidth:\s*144/);
    expect(source).not.toContain('numberOfLines={2}');
  });
});
