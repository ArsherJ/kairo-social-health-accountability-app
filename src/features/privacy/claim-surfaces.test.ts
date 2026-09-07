import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEALTH_DISCLOSURE } from '../health/disclosure.ts';
import { INVITE_HOST } from '../squad/invite-link.ts';
import { inviteMessage } from '../squad/invite-message.ts';
import { SUPPORT_EMAIL } from '../support/links.ts';
import { PRIVACY_CLAIM } from './claim-copy.ts';

/**
 * One test owns the question *"what does Kairo claim about your data?"*, and
 * checks it against every surface that makes the claim, from a list.
 *
 * **This replaces three scans, and the replacement is the point.** The same
 * fact used to be asserted from a file named after the invite message, one
 * named after the support links and one named after the HealthKit disclosure —
 * so a fourth surface making the claim had nowhere obvious to be registered,
 * which is exactly how the claim went stale in four places at once earlier this
 * year. Two scans of one rule always drift, and one always ends up quietly
 * narrower.
 *
 * A surface declares the rules it makes; the bans below apply to all of them,
 * because a retired promise is wrong wherever it appears. The web pages are
 * read off disk rather than imported: they are standalone HTML with no build
 * step, which is a property worth keeping, and the vitest root is the
 * repository root.
 *
 * **What this cannot do.** The landing page's six-character invite validation
 * is a second copy of `isValidInviteCode` that standalone HTML cannot import;
 * `invite-message.test.ts` catches that copy being *deleted* and neither file
 * can catch it *diverging*. And nothing here reaches App Store Connect or
 * TestFlight's test information, which carry the same claim outside the repo.
 */

/* ------------------------------------------------------------------ rules */

interface Rule {
  /** Read as "the surface …". Named in the failure. */
  the: string;
  holds: (text: string) => void;
}

const RULES = {
  contact: {
    the: 'names the address the app tells people to write to',
    holds: (text) => {
      expect(text).toContain(SUPPORT_EMAIL);
    },
  },

  fourTotals: {
    the: 'names the four daily totals a consenting squadmate sees',
    holds: (text) => {
      // Deviation #47: steps, distance, active calories and sleep. Matched on
      // the substance rather than the sentence — the wording is copy, the four
      // totals are the promise.
      for (const total of ['steps', 'distance', 'calories', 'sleep']) {
        expect(text.toLowerCase()).toContain(total);
      }
    },
  },

  totalsOnly: {
    the: 'says the sharing is daily totals and denies the trail behind them',
    holds: (text) => {
      // The corrected in-app wording. Both halves, because "daily totals" on
      // its own is the compression that made the retired claim readable as
      // "nothing leaves the phone".
      expect(text).toMatch(/daily totals/i);
      expect(text).toMatch(/hour-by-hour/i);
    },
  },

  mutual: {
    the: 'says the sharing is reciprocal, so nobody reads it as one-way',
    holds: (text) => {
      // Somebody deciding whether to hand anything over needs to know they are
      // not signing anything away: the gate is reciprocal and refusable.
      expect(text).toMatch(/both agreed|each other|both ways|both of you/i);
    },
  },

  neverHeartRate: {
    the: 'says heart rate is not shared',
    holds: (text) => {
      // §5 protects hourly movement and heart rate is at least as revealing.
      // A reader who assumes it reaches a squadmate has been misled by
      // omission — it is owner-readable only and in no projection.
      expect(text).toMatch(/heart rate/i);
      expect(text).toMatch(/never (see|shown|shared|scored)|never sees/i);
    },
  },

  neverWorkouts: {
    the: 'names workouts among the things a squadmate never sees',
    holds: (text) => {
      // `workout_sessions` is owner-readable only and appears in no `public`
      // function's body. A pace carries fitness; with distance it carries
      // routine.
      expect(text).toMatch(/workouts/i);
    },
  },

  pooledBattleRetired: {
    the: 'says the pooled Battle total is no longer shared',
    holds: (text) => {
      // It was the one figure shared without the agreement, and in a squad of
      // two the arithmetic made it a partner's own figure. Deviation #66
      // retired it on 2026-09-06, so the page says so in the past tense — a
      // page still claiming a live disclosure that cannot happen is as wrong
      // as one hiding a disclosure that can.
      expect(text).toMatch(/pooled/i);
      expect(text).toMatch(/two/i);
      expect(text).toMatch(/no longer is|retired/i);
    },
  },

  deletion: {
    the: 'says how to delete everything, from inside the app',
    holds: (text) => {
      expect(text).toMatch(/delete (your|my) account/i);
    },
  },

  neverWrites: {
    the: 'says Kairo never writes to Apple Health',
    holds: (text) => {
      expect(text).toMatch(/never writes|writes nothing|does not write/i);
    },
  },

  pointsAtTheClaim: {
    the: 'sends the reader to the surface that makes the claim',
    holds: (text) => {
      expect(text).toContain(`https://${INVITE_HOST}/`);
    },
  },

  noClaim: {
    the: 'attempts no claim of its own, having no room to make one honestly',
    holds: (text) => {
      // The retired clause was "Steps, never Health data" — false in two ways
      // at once, since steps *are* Health data and a consenting squadmate sees
      // four daily totals rather than none. It had no subject either, so it
      // asserted nothing about who sees what. The compression is the cause,
      // which is why the fix was to move the claim rather than shorten it
      // again.
      //
      // "Health" is the word that makes the sentence false and this copy needs
      // it for nothing else. "Steps" is deliberately not banned: it is
      // ordinary English this copy may legitimately want. Case-sensitive and
      // word-bounded like every guard here — a loose /health/i fires on
      // "healthy", and a guard that fails on legitimate copy gets loosened
      // until it guards nothing.
      expect(text).not.toMatch(/\bHealth\b/);
      expect(text).not.toMatch(CLAIM_MARKERS);
    },
  },
} satisfies Record<string, Rule>;

type RuleName = keyof typeof RULES;

/* --------------------------------------------------------------- the bans */

/**
 * True of every surface, whatever it claims, because a retired promise is
 * wrong wherever it appears.
 */
const BANS: { the: string; pattern: RegExp }[] = [
  {
    // Deviation #51 renamed the stats to Body, Motion and Mind on every
    // surface, and the permission sheet kept saying "Score your AGI" for a
    // week: `stat-names.test.ts` scans for the retired *word* "Agility", which
    // a three-letter key does not contain. Word-bounded and case-sensitive
    // like every engine-key guard in the repo — a loose /str/i matches
    // "strain", and a loose /agi/i matches "Dagit", a perfectly good name for
    // a Philippine eagle.
    the: 'speaks no engine key',
    pattern: /\b(AGI|STR|MND)\b/,
  },
  {
    // The gap that let "Score your END" ship for a day. END, VIT and REC were
    // retired on 2026-08-20 (deviation #41) and the sheet kept naming two of
    // them, on the one screen where a person decides what to hand over.
    the: 'names no stat that no longer exists',
    pattern: /\b(END|VIT|REC)\b/,
  },
  {
    // Bronze/Silver/Gold went internal to scoring at deviation #23. The
    // 2026-08-08 policy draft named all three, which is why it is not the page
    // that shipped.
    the: 'names no retired tier',
    pattern: /\b(Bronze|Silver|Gold)\b/,
  },
  {
    // The exact sentences that went stale. "Never the raw numbers" and "never
    // see your steps" were both true before deviation #47 and false after it,
    // in the same move.
    the: 'makes no retired promise',
    pattern: /never (the |your )?raw|never see your steps|nobody sees your steps|scores only/i,
  },
  {
    the: 'carries no placeholder',
    pattern: /\[\[TODO/,
  },
];

/* ----------------------------------------------------------- the surfaces */

interface ClaimSurface {
  /** How the surface is named in a failure. */
  name: string;
  /** Where a reader goes to fix it. */
  where: string;
  /** The claim itself — what the positive rules read. */
  claim: () => string;
  /**
   * Read by the bans **in addition to** the claim, never instead of it.
   *
   * Both halves are needed and each covers the other's blind spot. A ban that
   * reads only the claim misses the retired sentence that merely moved out of
   * it — into the rest of the policy page, or into a caption one element over.
   * A ban that reads only the document misses the claim itself once the copy
   * lives in `claim-copy.ts` and the screen only imports it, which is how
   * restoring "never the raw numbers" to `/connect` passed this file once
   * before being caught.
   */
  alsoScan?: () => string;
  makes: RuleName[];
}

/** Visible text: tags, styles and scripts gone, entities left alone. */
function pageText(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/<(style|script)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');
}

/** One `<section class="…">` of a page, as visible text. */
function sectionText(path: string, name: string): string {
  const source = readFileSync(path, 'utf8');
  const section = new RegExp(`<section class="${name}">([\\s\\S]*?)</section>`).exec(source);
  return (section?.[1] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

const SURFACES: ClaimSurface[] = [
  {
    name: 'the privacy policy',
    where: 'web/privacy.html',
    claim: () => pageText('web/privacy.html'),
    makes: [
      'contact',
      'fourTotals',
      'mutual',
      'neverHeartRate',
      'neverWorkouts',
      'pooledBattleRetired',
      'deletion',
      'neverWrites',
    ],
  },
  {
    name: 'the landing page',
    where: 'web/index.html',
    // The privacy section, not the whole page: `toContain('steps')` passes on
    // a page whose privacy section has been deleted, because "steps" appears
    // in the Daily Walk card too. A guard that survives the deletion of its
    // subject is not a guard.
    claim: () => sectionText('web/index.html', 'privacy'),
    alsoScan: () => pageText('web/index.html'),
    makes: ['fourTotals', 'mutual', 'neverHeartRate', 'neverWorkouts'],
  },
  {
    name: 'the HealthKit permission sheet',
    where: 'src/features/health/disclosure.ts',
    // Derived from the request list, so it cannot understate the ask; what it
    // cannot derive is the prose beside each identifier, which is what this
    // reads.
    claim: () => HEALTH_DISCLOSURE.map((g) => `${g.label}: ${g.purpose}`).join('\n'),
    // Not `neverWorkouts`: this sheet names workouts as something it *reads*,
    // and the rule is about what a squadmate never sees. It would pass on the
    // word alone, which is a rule passing for the wrong reason — the way a
    // scan ends up quietly narrower than the one beside it.
    makes: ['fourTotals', 'neverHeartRate'],
  },
  {
    name: 'the privacy beat',
    where: 'app/(onboard)/privacy.tsx',
    claim: () => `${PRIVACY_CLAIM.healthRequired}\n${PRIVACY_CLAIM.sharingTotals}`,
    makes: ['totalsOnly', 'mutual'],
  },
  {
    name: 'the Health ask on /connect',
    where: 'app/(onboard)/connect.tsx',
    claim: () => PRIVACY_CLAIM.connectHealth,
    // The bans read the whole screen, not just the help line: this is the
    // screen an App Store reviewer opens for the health-data disclosure rule,
    // and a retired stat in the title or a stray engine key in a caption is
    // the same defect one element over. Comments stripped, so the reasoning
    // beside the copy is not mistaken for the copy.
    alsoScan: () => code(readFileSync('app/(onboard)/connect.tsx', 'utf8')),
    makes: ['fourTotals', 'totalsOnly', 'mutual'],
  },
  {
    name: 'the invite message',
    where: 'src/features/squad/invite-message.ts',
    claim: () => inviteMessage({ squadName: 'Barangay Runners', inviteCode: 'NRN7P7' }),
    makes: ['noClaim', 'pointsAtTheClaim'],
  },
];

/**
 * Phrases only a privacy claim carries, used to find a surface making one
 * without being registered here.
 */
const CLAIM_MARKERS = /hour-by-hour|never your route|both agreed|raw numbers/i;

/** Where in-app claim copy lives, and the only file allowed to write one. */
const CLAIM_COPY = 'src/features/privacy/claim-copy.ts';

/** Source with comments removed, so prose about a claim is not a claim. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every non-test TypeScript source under a directory, read. */
function sourcesUnder(dir: string): { path: string; source: string }[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) return [];
    return [{ path, source: readFileSync(path, 'utf8') }];
  });
}

/* -------------------------------------------------------------- the suite */

describe('the privacy claim, across every surface that makes it', () => {
  for (const surface of SURFACES) {
    describe(surface.name, () => {
      it(`has something to say at all (${surface.where})`, () => {
        // Blanking a claim must fail here rather than pass every rule below by
        // vacuum: an empty string satisfies every ban ever written.
        expect(surface.claim().trim().length).toBeGreaterThan(40);
      });

      it('claims something', () => {
        // A surface registered with no rules is a surface with no guard, which
        // is the state this file exists to end.
        expect(surface.makes.length).toBeGreaterThan(0);
      });

      for (const name of surface.makes) {
        const rule = RULES[name] as Rule;
        it(rule.the, () => rule.holds(surface.claim()));
      }

      for (const ban of BANS) {
        it(ban.the, () => {
          expect(`${surface.claim()}\n${surface.alsoScan?.() ?? ''}`).not.toMatch(ban.pattern);
        });
      }
    });
  }
});

describe('the pages that carry the claim to a stranger', () => {
  // Not a claim rule, and it lives here because this is where both pages are
  // declared. Standalone HTML with no build step and no external request is a
  // property worth keeping for its own sake: the policy is the page an App
  // Review reader opens, and a page that fetches a font tells a third party
  // who read it.
  for (const surface of SURFACES.filter((s) => s.where.startsWith('web/'))) {
    it(`${surface.name} makes no external request`, () => {
      const source = readFileSync(surface.where, 'utf8');
      expect(source).not.toMatch(/<link[^>]+href="https?:/);
      expect(source).not.toMatch(/<img/);
    });
  }

  it('the privacy policy runs no script at all', () => {
    // The landing page has one, and it is the invite-code reveal — inline, no
    // request, and `invite-message.test.ts` owns it. The policy needs none.
    expect(readFileSync('web/privacy.html', 'utf8')).not.toMatch(/<script/);
  });
});

describe('the list is the whole list', () => {
  const registered = new Set(SURFACES.map((s) => s.where));

  it('registers every page served from the invite host', () => {
    // Removing `web/privacy.html` from the list above fails here rather than
    // silently leaving the policy unguarded.
    for (const file of readdirSync('web').filter((f) => f.endsWith('.html'))) {
      expect(registered).toContain(`web/${file}`);
    }
  });

  it('registers every sentence in the app that makes the claim', () => {
    // `claim-copy.ts` is where in-app claim copy lives, so a sentence added
    // there and registered nowhere is caught the moment it exists.
    const claimed = SURFACES.map((s) => s.claim()).join('\n');
    for (const sentence of Object.values(PRIVACY_CLAIM)) {
      expect(claimed).toContain(sentence);
    }
  });

  it('lets no screen write a claim of its own', () => {
    // The sweep. A screen that hand-writes the sentence instead of importing
    // it is a fifth copy the moment it exists, which is the whole shape of the
    // failure this file was built after — and it is one line away at any time,
    // because a sentence in a `<Text>` is the most ordinary thing in the app.
    //
    // Comments stripped first: this repo explains its claims in prose beside
    // them, and a guard that fails on its own doc comment gets deleted.
    // Registered surfaces are **not** exempt. Being on the list means the
    // claim is guarded, not that the screen may write one: `/privacy` and
    // `/connect` are both registered and both read the module. Only the module
    // itself is allowed the words.
    const offenders = [...sourcesUnder('app'), ...sourcesUnder('src')]
      .filter(({ path }) => path !== CLAIM_COPY)
      .filter(({ source }) => CLAIM_MARKERS.test(code(source)))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('registers every line of the HealthKit disclosure', () => {
    const claimed = SURFACES.find((s) => s.where.endsWith('disclosure.ts'))?.claim() ?? '';
    for (const group of HEALTH_DISCLOSURE) {
      expect(claimed).toContain(group.label);
      expect(claimed).toContain(group.purpose);
    }
  });
});
