import { create } from 'zustand';
import type { QuestTier } from '@kairo/core';

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
}

interface AnswerStore extends OnboardingAnswers {
  setQuestTier: (tier: QuestTier | null) => void;
  setShareTotals: (share: boolean) => void;
  reset: () => void;
}

const INITIAL: OnboardingAnswers = { questTier: null, shareTotals: true };

export const useOnboardingAnswers = create<AnswerStore>((set) => ({
  ...INITIAL,
  setQuestTier: (questTier) => set({ questTier }),
  setShareTotals: (shareTotals) => set({ shareTotals }),
  reset: () => set(INITIAL),
}));
