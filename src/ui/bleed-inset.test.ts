import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every bleeding screen re-applies the top safe-area inset.
 *
 * `Screen bleed` drops the top padding on purpose, so a header gradient can run
 * under the status bar, and hands the inset back to the screen to re-apply
 * wherever its first *content* starts. `Screen`'s own doc comment says so.
 *
 * That was not enough. `ProfileHeader` shipped without it: the handle collided
 * with the clock and the gear disc sat inside the Dynamic Island's cutout,
 * where it could not be tapped at all — so the only route to Settings was
 * unreachable. Nothing errored, nothing logged, and the screen was recognisably
 * itself apart from one row. It took a screenshot from a real device to find.
 *
 * The check follows **one level of imports**, because the inset is usually
 * applied by the header component rather than by the route file — `profile.tsx`
 * bleeds and `ProfileHeader` is what pads. One level is enough for every case
 * the app has and stops well short of walking the whole graph.
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** `@/features/x/Y.tsx` and `./Y.tsx` -> a path on disk, when one exists. */
function resolveImport(fromFile: string, spec: string): string | null {
  const candidate = spec.startsWith('@/')
    ? join('src', spec.slice(2))
    : spec.startsWith('.')
      ? join(fromFile, '..', spec)
      : null;
  if (candidate === null) return null;
  try {
    return statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function appliesInset(source: string): boolean {
  return source.includes('insets.top');
}

describe('Screen bleed', () => {
  it('is only used by screens that re-apply the top inset themselves', () => {
    const all = [...sourceFiles('src'), ...sourceFiles('app')];

    const offenders = all.filter((path) => {
      const source = readFileSync(path, 'utf8');
      // Matches `<Screen bleed>` and `<Screen\n  bleed`, and not `bleeding`.
      if (!/<Screen\s[^>]*\bbleed\b/s.test(source)) return false;
      if (appliesInset(source)) return false;

      // One level out: the header component is usually what pads.
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] as string);
      return !imports.some((spec) => {
        const resolved = resolveImport(path, spec);
        return resolved !== null && appliesInset(readFileSync(resolved, 'utf8'));
      });
    });

    expect(offenders).toEqual([]);
  });

  it('actually finds the bleeding screens, so a passing run means something', () => {
    // Without this the test above passes vacuously the day the regex stops
    // matching — which is the failure mode of every scan-based guard.
    const bleeding = [...sourceFiles('src'), ...sourceFiles('app')].filter((path) =>
      /<Screen\s[^>]*\bbleed\b/s.test(readFileSync(path, 'utf8')),
    );
    expect(bleeding.length).toBeGreaterThanOrEqual(3);
  });
});
