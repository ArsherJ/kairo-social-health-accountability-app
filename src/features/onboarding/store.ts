import { create } from 'zustand';

/**
 * Whether the onboarding stack is still mid-flow after the profile row exists.
 *
 * The name step commits the row, which is what the route gate reads as "this
 * user is onboarded" — so from that instant the gate wants to send them to the
 * tabs, even though the focus question (§5) has not been asked yet. This flag
 * is how the gate knows to wait; `redirectTarget` in `features/auth/route.ts`
 * owns the rule and is tested there.
 *
 * **In-memory on purpose.** A force-quit between the two steps resumes into the
 * tabs with focus unset, which is exactly the tradeoff that lets profile-row
 * existence stay the single onboarding marker. Focus is editable in Profile,
 * so nothing is lost permanently.
 */
type OnboardingState = {
  finishingOnboarding: boolean;
};

export const useOnboardingStore = create<OnboardingState>(() => ({
  finishingOnboarding: false,
}));

export function beginFocusStep(): void {
  useOnboardingStore.setState({ finishingOnboarding: true });
}

export function endFocusStep(): void {
  useOnboardingStore.setState({ finishingOnboarding: false });
}
