import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEALTH_DISCLOSURE } from '../health/disclosure.ts';
import { INVITE_HOST } from '../squad/invite-link.ts';
import { inviteMessage } from '../squad/invite-message.ts';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL } from '../support/links.ts';
import { NO_TRAIL_CLAUSE, PRIVACY_CLAIM } from './claim-copy.ts';

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

/**
 * Phrases only a privacy claim carries, used to find a surface making one
 * without being registered here.
 *
 * "daily totals" earns its place the hard way: without it the sweep missed
 * `HealthPermissionSheet.tsx`, which had been making the claim in its own
 * words the whole time — a sixth surface, in the file that renders the
 * disclosure, invisible to a marker list written from the sentences somebody
 * already knew about.
 */
const CLAIM_MARKERS = /hour-by-hour|never your route|both agreed|raw numbers|daily totals/i;

/* ------------------------------------------------------------------ rules */

interface Rule {
  /** Reads as "the surface …", and is the failure's name. */
  named: string;
  holds: (text: string) => void;
}

/**
 * The sentences of a text containing a word, so a denial can be required
 * *beside* what it denies rather than anywhere in the same document.
 *
 * Two unanchored `toMatch`es are the trap: a page saying "we collect your
 * heart rate" and, four paragraphs later, "your route is never shared" passes
 * a rule named "says heart rate is not shared". This is the same shape the
 * disclosure sheet's entry already refuses — a rule passing for the wrong
 * reason is how a scan ends up quietly narrower than the one beside it.
 */
function sentencesWith(text: string, word: RegExp): string[] {
  return text.split(/(?<=\.)\s+/).filter((sentence) => word.test(sentence));
}

const RULES = {
  contact: {
    named: 'names the address the app tells people to write to',
    holds: (text) => {
      expect(text).toContain(SUPPORT_EMAIL);
    },
  },

  fourTotals: {
    named: 'names the four daily totals a consenting squadmate sees',
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
    named: 'says the sharing is daily totals and denies the trail behind them',
    holds: (text) => {
      // Both halves, because "daily totals" on its own is the compression that
      // made the retired claim readable as "nothing leaves the phone" — and
      // the denial is the half `links.test.ts` pinned on the policy page as a
      // bare `/hour/i` and this file dropped for a commit, which is the
      // "quietly narrower" failure consolidation is supposed to prevent.
      //
      // Three wordings because three already ship and all three are true:
      // the beats say "hour-by-hour trail", the landing page "when in the day
      // you moved", the permission sheet "when you moved". A rule that
      // accepted only the in-app phrasing would fail honest copy, and a guard
      // that fails on real input gets loosened until it guards nothing.
      expect(text).toMatch(/daily totals/i);
      expect(text).toMatch(/hour-by-hour|when (in the day )?you moved/i);
    },
  },

  namesNoRetiredStat: {
    named: 'names no stat the app stopped scoring',
    holds: (text) => {
      // "Active minutes" is why this rule exists: `/connect` listed it among
      // what Kairo reads and scores, two weeks after deviation #41 folded END
      // into Body. It is **not** a universal ban, because it is also the name
      // of a HealthKit type — `AppleExerciseTime` — and the permission sheet
      // legitimately discloses reading it under exactly that label. So the
      // rule is declared by the surfaces whose sentence is about what is
      // *scored or shared*, where naming it is a claim rather than a label.
      expect(text).not.toMatch(/active minutes/i);
      expect(text).not.toMatch(/\b(Endurance|Vitality|Recovery)\b/);
    },
  },

  mutual: {
    named: 'says the sharing is reciprocal, so nobody reads it as one-way',
    holds: (text) => {
      // Somebody deciding whether to hand anything over needs to know they are
      // not signing anything away: the gate is reciprocal and refusable.
      expect(text).toMatch(/both agreed?|each other|both ways|both of you/i);
    },
  },

  neverHeartRate: {
    named: 'says heart rate is not shared, in the sentence that names it',
    holds: (text) => {
      // §5 protects hourly movement and heart rate is at least as revealing.
      // A reader who assumes it reaches a squadmate has been misled by
      // omission — it is owner-readable only and in no projection.
      const sentences = sentencesWith(text, /heart rate/i);
      expect(sentences.length).toBeGreaterThan(0);
      expect(sentences.some((s) => /never|nobody/i.test(s))).toBe(true);
    },
  },

  neverWorkouts: {
    named: 'names workouts among the things a squadmate never sees',
    holds: (text) => {
      // `workout_sessions` is owner-readable only and appears in no `public`
      // function's body. A pace carries fitness; with distance it carries
      // routine. Scoped to the sentence for `neverHeartRate`'s reason: the
      // bare word passes on a page that merely mentions reading them.
      const sentences = sentencesWith(text, /workouts/i);
      expect(sentences.length).toBeGreaterThan(0);
      expect(sentences.some((s) => /never|nobody/i.test(s))).toBe(true);
    },
  },

  pooledBattleRetired: {
    named: 'says the pooled Battle total is no longer shared',
    holds: (text) => {
      // It was the one figure shared without the agreement, and in a squad of
      // two the arithmetic made it a partner's own figure. Deviation #66
      // retired it on 2026-09-06, so the page says so in the past tense — a
      // page still claiming a live disclosure that cannot happen is as wrong
      // as one hiding a disclosure that can.
      expect(text).toMatch(/pooled/i);
      expect(text).toMatch(/squad of two/i);
      expect(text).toMatch(/no longer is|retired/i);
    },
  },

  deletion: {
    named: 'says how to delete everything, from inside the app',
    holds: (text) => {
      expect(text).toMatch(/delete (your|my) account/i);
    },
  },

  neverWrites: {
    named: 'says Kairo never writes to Apple Health',
    holds: (text) => {
      expect(text).toMatch(/never writes|writes nothing|does not write/i);
    },
  },

  pointsAtTheClaim: {
    named: 'sends the reader to the surface that makes the claim',
    holds: (text) => {
      expect(text).toContain(`https://${INVITE_HOST}/`);
    },
  },

  noClaim: {
    named: 'attempts no claim of its own, having no room to make one honestly',
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
const BANS: { named: string; pattern: RegExp }[] = [
  {
    // Deviation #51 renamed the stats to Body, Motion and Mind on every
    // surface, and the permission sheet kept saying "Score your AGI" for a
    // week: `stat-names.test.ts` scans for the retired *word* "Agility", which
    // a three-letter key does not contain. Word-bounded and case-sensitive
    // like every engine-key guard in the repo — a loose /str/i matches
    // "strain", and a loose /agi/i matches "Dagit", a perfectly good name for
    // a Philippine eagle.
    named: 'speaks no engine key',
    pattern: /\b(AGI|STR|MND)\b/,
  },
  {
    // The gap that let "Score your END" ship for a day. END, VIT and REC were
    // retired on 2026-08-20 (deviation #41) and the sheet kept naming two of
    // them, on the one screen where a person decides what to hand over.
    named: 'names no stat that no longer exists',
    pattern: /\b(END|VIT|REC)\b/,
  },
  {
    // Bronze/Silver/Gold went internal to scoring at deviation #23. The
    // 2026-08-08 policy draft named all three, which is why it is not the page
    // that shipped.
    named: 'names no retired tier',
    pattern: /\b(Bronze|Silver|Gold)\b/,
  },
  {
    // The exact sentences that went stale. "Never the raw numbers" and "never
    // see your steps" were both true before deviation #47 and false after it,
    // in the same move.
    named: 'makes no retired promise',
    pattern: /never (the |your )?raw|never see your steps|nobody sees your steps|scores only/i,
  },
  {
    named: 'carries no placeholder',
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
  /**
   * The screen that renders it, for surfaces whose copy lives in
   * `claim-copy.ts`.
   *
   * Without this the in-app rules are self-referential: `claim()` reads the
   * module, so deleting the `<Text>` from `/connect` leaves every rule passing
   * on a sentence nobody can see. The web surfaces are read off disk and have
   * the link by construction; these three need it stated.
   */
  rendersFrom?: {
    path: string;
    keys: (keyof typeof PRIVACY_CLAIM)[];
    /** A dumb shared view renders these injected props; its route binds the claim keys. */
    props?: string[];
    bindingPath?: string;
  };
}

/** Markup as a reader sees it: tags gone, whitespace collapsed. */
function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

/** A whole page's visible text, styles and scripts dropped first. */
function pageText(path: string): string {
  return visibleText(readFileSync(path, 'utf8').replace(/<(style|script)[\s\S]*?<\/\1>/g, ' '));
}

/** One `<section class="…">` of a page, as visible text. */
function sectionText(path: string, name: string): string {
  const source = readFileSync(path, 'utf8');
  const section = new RegExp(`<section class="${name}">([\\s\\S]*?)</section>`).exec(source);
  return visibleText(section?.[1] ?? '');
}

const SURFACES: ClaimSurface[] = [
  {
    name: 'the privacy policy',
    where: 'web/privacy.html',
    claim: () => pageText('web/privacy.html'),
    makes: [
      'contact',
      'fourTotals',
      'totalsOnly',
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
    makes: ['fourTotals', 'totalsOnly', 'mutual', 'neverHeartRate', 'neverWorkouts', 'namesNoRetiredStat'],
  },
  {
    name: 'the HealthKit permission sheet',
    where: 'src/features/health/HealthPermissionSheet.tsx',
    // Two halves of one screen. The list of types is *derived* from
    // `KAIRO_READ_TYPES`, so it cannot understate the ask; the fine print
    // under it is prose, and was hand-written in the component and registered
    // nowhere until the sweep found it.
    //
    // Deliberately **not** `namesNoRetiredStat`: "Active minutes" is the name
    // of a HealthKit type here, on the screen whose job is disclosing which
    // types are read, and banning the label would fail honest copy.
    claim: () =>
      [
        ...HEALTH_DISCLOSURE.map((g) => `${g.label}: ${g.purpose}.`),
        PRIVACY_CLAIM.permissionSheetFine,
      ].join('\n'),
    makes: ['fourTotals', 'totalsOnly', 'mutual', 'neverHeartRate', 'neverWorkouts', 'neverWrites'],
    rendersFrom: {
      path: 'src/features/health/HealthPermissionSheet.tsx',
      keys: ['permissionSheetFine'],
    },
  },
  {
    name: 'the privacy beat',
    where: 'app/(onboard)/privacy.tsx',
    claim: () => `${PRIVACY_CLAIM.healthRequired}\n${PRIVACY_CLAIM.sharingTotals}`,
    makes: ['totalsOnly', 'mutual', 'namesNoRetiredStat'],
    rendersFrom: {
      path: 'src/features/onboarding/PrivacyScreen.tsx',
      keys: ['healthRequired', 'sharingTotals'],
      props: ['healthCopy', 'sharingCopy'],
      bindingPath: 'app/(onboard)/privacy.tsx',
    },
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
    alsoScan: () => code(readFileSync('src/features/onboarding/ConnectScreen.tsx', 'utf8')),
    makes: ['fourTotals', 'totalsOnly', 'mutual', 'namesNoRetiredStat'],
    rendersFrom: {
      path: 'src/features/onboarding/ConnectScreen.tsx',
      keys: ['connectHealth'],
      props: ['privacyCopy'],
      bindingPath: 'app/(onboard)/connect.tsx',
    },
  },
  {
    name: 'the invite message',
    where: 'src/features/squad/invite-message.ts',
    claim: () => inviteMessage({ squadName: 'Barangay Runners', inviteCode: 'NRN7P7' }),
    makes: ['noClaim', 'pointsAtTheClaim'],
  },
];

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
        it(rule.named, () => rule.holds(surface.claim()));
      }

      if (surface.rendersFrom) {
        const { path, keys, props, bindingPath } = surface.rendersFrom;
        it(`is actually rendered by ${path}`, () => {
          const source = code(readFileSync(path, 'utf8'));
          if (props) {
            for (const prop of props) expect(source).toContain(prop);
            const binding = code(readFileSync(bindingPath ?? '', 'utf8'));
            for (const key of keys) expect(binding).toContain(`PRIVACY_CLAIM.${key}`);
          } else {
            for (const key of keys) expect(source).toContain(`PRIVACY_CLAIM.${key}`);
          }
        });
      }

      for (const ban of BANS) {
        it(ban.named, () => {
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

describe('the onboarding policy control', () => {
  it('opens the established public policy instead of an unrelated app route', () => {
    const source = code(readFileSync('app/(onboard)/privacy.tsx', 'utf8'));

    expect(source).toContain('PRIVACY_POLICY_URL');
    expect(source).toContain('Linking.openURL(PRIVACY_POLICY_URL)');
    expect(source).not.toContain("router.push('/progress')");
    expect(PRIVACY_POLICY_URL).toMatch(/^https:\/\/.+\/privacy$/);
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
    const claimed =
      SURFACES.find((s) => s.name === 'the HealthKit permission sheet')?.claim() ?? '';
    for (const group of HEALTH_DISCLOSURE) {
      expect(claimed).toContain(group.label);
      expect(claimed).toContain(group.purpose);
    }
  });
});
