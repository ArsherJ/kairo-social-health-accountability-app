import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A number typed into the Health app is not activity, and every quantity read
 * has to say so at the query.
 *
 * **This is not what sleep and workouts do**, and the difference is the whole
 * reason this guard exists. Those read `HKWasUserEntered` off the samples they
 * get back and let a pure module downstream decide. A statistics collection
 * returns *sums*, not samples — Apple has already added the typed-in number
 * into the bucket by the time it reaches us — so there is nothing left to
 * filter and the exclusion has to be part of the predicate.
 *
 * A source scan rather than a unit test, for `calibration-read.test.ts`'s
 * reason: `read.ts` imports the HealthKit library, whose Flow syntax root
 * Vitest cannot parse, and the behaviour under test is native anyway. What can
 * be checked here is that no collection was added without the predicate — the
 * failure this guards is silent in both directions, since a missing predicate
 * counts fabricated steps and a malformed one reads zero forever.
 */
const READ = 'src/features/health/read.ts';

/**
 * Source with comments removed, the same way `telemetry-payloads.test.ts` does
 * it and for the same reason: the module explains the trap it is avoiding, and
 * a guard that fails on the sentence describing why `notEqualTo` is wrong is a
 * guard that gets loosened until it guards nothing.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCE = code(readFileSync(READ, 'utf8'));

/** Text from `open` at `from` to its matching `close`, inclusive. */
function balanced(source: string, from: number, open: string, close: string): string {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close) {
      depth--;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  throw new Error(`unbalanced ${open} at ${from}`);
}

/** The body of a top-level `const <name> = { … }` or `function <name>(…)`. */
function declarationOf(name: string): string {
  const at = new RegExp(`\\b(?:const|function) ${name}\\b`).exec(SOURCE);
  expect(at, `no ${name} in read.ts`).not.toBeNull();
  return balanced(SOURCE, SOURCE.indexOf('{', at!.index), '{', '}');
}

/**
 * Every `queryStatisticsCollectionForQuantity(…)` argument list. The trailing
 * `(` is what separates a call from the import specifier of the same name.
 */
function collectionCalls(): string[] {
  const name = 'queryStatisticsCollectionForQuantity(';
  const calls: string[] = [];
  for (let at = SOURCE.indexOf(name); at !== -1; at = SOURCE.indexOf(name, at + 1)) {
    calls.push(balanced(SOURCE, at + name.length - 1, '(', ')'));
  }
  return calls;
}

/**
 * The filter a call actually passes, resolved through one `const` or one
 * function call. Resolved rather than grepped for the predicate in the call
 * text, so a shared builder still counts — the alternative is spreading the
 * same six lines into eight call sites to satisfy a test.
 */
function resolvedFilter(args: string): string {
  const named = /\bfilter\s*:\s*/.exec(args);
  if (!named) return '';
  const at = named.index + named[0].length;
  if (args[at] === '{') return balanced(args, at, '{', '}');
  const identifier = /^[A-Za-z_$][\w$]*/.exec(args.slice(at));
  if (!identifier) return '';
  const [name] = identifier;
  // `quantityFilter(from, to)` — resolve the builder's body.
  if (args[at + name.length] === '(') return declarationOf(name);
  // A local `const quantities = quantityFilter(…)` — one more hop.
  const local = new RegExp(`\\bconst ${name} = ([A-Za-z_$][\\w$]*)\\(`).exec(SOURCE);
  return local ? declarationOf(local[1] as string) : declarationOf(name);
}

/** Every `.ts`/`.tsx` file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('typed-in Health samples', () => {
  it('is excluded by every statistics collection in read.ts', () => {
    const calls = collectionCalls();

    // Exact, not a floor: the per-call assertion below cannot notice a read
    // that was *deleted*, and adding a genuine eighth quantity read should
    // cost a human one line and one glance at this rule.
    expect(calls, 'a statistics collection was added or removed').toHaveLength(8);

    for (const args of calls) {
      const identifier = /HKQuantityTypeIdentifier[A-Za-z]+/.exec(args)?.[0] ?? args.slice(0, 60);
      expect(
        resolvedFilter(args),
        `${identifier} is read without excluding typed-in samples`,
      ).toContain('EXCLUDE_TYPED_IN');
    }
  });

  it('excludes by a compound NOT against equalTo, never notEqualTo', () => {
    const predicate = declarationOf('EXCLUDE_TYPED_IN');

    expect(predicate).toMatch(/NOT:\s*\[/);
    expect(predicate).toContain("withMetadataKey: 'HKWasUserEntered'");
    expect(predicate).toContain('ComparisonPredicateOperator.equalTo');
    expect(predicate).toContain('value: true');

    // An automatically-recorded sample carries no such key at all, and `!=`
    // against a missing key is not reliably true — the failure is every read
    // returning zero, forever, with no error anywhere.
    expect(SOURCE, 'notEqualTo excludes every sample that has no flag').not.toContain(
      'notEqualTo',
    );
  });

  it('is the only file that reads a statistics collection', () => {
    // The scan above is worth exactly as much as this claim. A collection
    // opened anywhere else would carry no predicate and nothing would say so.
    const elsewhere = [...filesUnder('src'), ...filesUnder('app')].filter(
      (path) =>
        path !== READ &&
        !path.endsWith('.test.ts') &&
        code(readFileSync(path, 'utf8')).includes('queryStatisticsCollectionForQuantity'),
    );

    expect(elsewhere, 'a quantity read outside read.ts is outside the guard').toEqual([]);
  });
});
