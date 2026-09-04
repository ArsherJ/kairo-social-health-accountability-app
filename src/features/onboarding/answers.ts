import { create } from 'zustand';
import type { QuestCalibration, QuestTier } from '@kairo/core';

/**
 * What onboarding has collected but not yet written.
 *
 * **This exists because of deviation #22, not in spite of it.** The rule is
 * that the profile row commits exactly once, on the name screen, and that
 * nothing may be *asked* after that INSERT — anything asked afterwards flips
 * `resolveRoute` to `'ready'` underneath an unfinished screen and needs the
 * deleted `finishingOnboarding` flag back.
 *
 * The Playful run asks two things the row has to carry: how hard the daily
 * three should be, and whether totals are shared with a flock. The design puts
 * both *after* the name, which is exactly the trap. Putting them before it runs
 * into the other half of the problem — `quest_tier_override` and
 * `squad_data_consent_at` are in `profiles`' column-level **UPDATE** grant and
 * not its INSERT grant, so there is nothing to write them to until the row
 * exists.
 *
 * So the answers are held here and written by the name screen: INSERT the row,
 * then UPDATE it with what was already collected, then navigate. Nothing is
 * asked after the INSERT, the row still commits once, and both grants are
 * respected. The store is the only new moving part and it is deliberately tiny.
 *
 * **Cleared on commit**, so a second account created on the same device in the
 * same launch does not inherit the first one's answers — an obscure path, and a
 * cheap one to close.
 */
export interface OnboardingAnswers {
  /**
   * `null` is a real answer, not an absent one: it means "use `questTier()`'s
   * trailing-scored-days rule", which is what Automatic is and what every
   * account starts on.
   */
  questTier: QuestTier | null;
  /**
   * Whether to share daily totals with a flock (deviation #47's consent).
   *
   * Defaults **true**, matching what the privacy screen shows selected — and
   * unlike the quest tier this is a claim about a person, so the screen states
   * it plainly rather than burying it. Someone who never reaches that screen
   * (a deep link, an interrupted run) is written as consenting because the
   * screen they skipped would have shown it on; if that ever stops being the
   * default the two have to move together.
   */
  shareTotals: boolean;
  /**
   * What the Health grant's step reading concluded, or `null` when no reading
   * was taken — the ask was skipped, or the platform has no health source.
   *
   * **This is where the fortnight lives and dies** (deviation #63). It crosses
   * from `/connect` to `/difficulty` here and nowhere else: the median is never
   * written to `profiles` and never enters a telemetry payload, which is
   * exactly what the difficulty beat's privacy line claims. The store is
   * already cleared on commit, so it does not outlive the run either.
   */
  calibration: QuestCalibration | null;
  /**
   * Whether the player has answered the difficulty question themselves.
   *
   * The proposal pre-selects a tier by *writing* `questTier`, so without this
   * there is no way to tell a seeded value from a chosen one — and re-entering
   * `/connect` and granting again would silently overwrite a choice the player
   * had already made two screens later. Their answer wins outright, which is
   * the same rule `questTier`'s override follows and the reason the choices are
   * on that screen at all.
   */
  questTierChosen: boolean;
}

interface AnswerStore extends OnboardingAnswers {
  setQuestTier: (tier: QuestTier | null) => void;
  setShareTotals: (share: boolean) => void;
  /**
   * Record a reading, and pre-select what it proposes.
   *
   * Pre-selecting here rather than on the difficulty beat is what makes "the
   * proposal is the default" a fact about the answer rather than about one
   * screen's render: a player who skips straight past the beat still commits
   * the tier that was measured for them, which is the point of measuring.
   *
   * A `no-history` reading changes nothing, leaving `questTier` at `null` —
   * Automatic — which is the stated fallback.
   */
  setCalibration: (calibration: QuestCalibration | null) => void;
  reset: () => void;
}

const INITIAL: OnboardingAnswers = {
  questTier: null,
  shareTotals: true,
  calibration: null,
  questTierChosen: false,
};

export const useOnboardingAnswers = create<AnswerStore>((set) => ({
  ...INITIAL,
  setQuestTier: (questTier) => set({ questTier, questTierChosen: true }),
  setShareTotals: (shareTotals) => set({ shareTotals }),
  setCalibration: (calibration) =>
    set((state) => ({
      calibration,
      // The player's own answer wins outright, exactly as it does over the
      // automatic rule. A second reading may not reach back and overwrite it.
      questTier:
        state.questTierChosen || calibration?.outcome !== 'proposed'
          ? state.questTier
          : calibration.tier,
    })),
  reset: () => set(INITIAL),
}));
