import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { font } from '../theme.ts';

/**
 * `src/theme.ts` is the only file that may name a typeface.
 *
 * This is `Text.tsx`'s rule one level down, and it was not being kept. When
 * Playful landed (deviation #58) seven call sites still said `'Figtree-Bold'`
 * or `'Figtree-SemiBold'` as string literals — a palette shift that renamed
 * both faces would have left them pointing at fonts no longer in the bundle,
 * and RN's answer to an unknown family is to silently fall back to the system
 * face. So the failure is invisible on the simulator that has the old font
 * installed and visible only on a clean device, which is the worst possible
 * place to find it.
 *
 * The guard is a scan rather than a type, because the mistake is a *string*
 * and no type can stop one being written. Same shape as `stat-names.test.ts`'s
 * "Agility" scan, for the same reason: the thing to prevent has no other
 * syntactic signature.
 */

/** Every .ts/.tsx under the app's own source, excluding tests. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

describe('the type system has one source', () => {
  it('bundles exactly the faces the tokens name', () => {
    // The other half of the same rule, and the half a scan cannot cover: a
    // token may only name a file `app/_layout.tsx` actually loads. Reading the
    // loader as text is deliberate — importing it would drag in expo-router
    // and every screen behind it.
    const loader = readFileSync('app/_layout.tsx', 'utf8');
    const named = new Set(
      [...Object.values(font.display), ...Object.values(font.body)].map((f) => f.fontFamily),
    );

    expect(named.size).toBeGreaterThan(0);
    for (const family of named) {
      expect(loader, `${family} is named by a token but not loaded`).toContain(`'${family}'`);
      // …and the file it points at is really there, since `require` of a
      // missing asset fails at bundle time on device and nowhere in CI.
      expect(() => statSync(`assets/fonts/${family}.ttf`)).not.toThrow();
    }
  });

  it('has no typeface named as a string literal outside the theme', () => {
    // Matches `fontFamily: 'Anything'`. The theme itself is excluded because
    // naming faces is precisely its job, and `JoinSquadForm` is excluded
    // because its invite code is deliberately set in the *platform* monospace
    // face — a code checked against a screenshot one glyph at a time, which no
    // bundled proportional face can do.
    const offenders = [...sourceFiles('src'), ...sourceFiles('app')]
      .filter((path) => !path.endsWith('theme.ts') && !path.endsWith('JoinSquadForm.tsx'))
      .filter((path) => /fontFamily:\s*'[^']+'/.test(readFileSync(path, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
