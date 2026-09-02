import { create } from 'zustand';

/**
 * Which native `<Modal>` currently owns the root view controller.
 *
 * **A `<Modal>` presents on the root view controller no matter where it is
 * mounted**, so two of them turning visible in the same frame are not
 * independent: UIKit refuses the second (*"Attempt to present … which is
 * already presenting …"*), suppresses it with no error the user can see, and
 * leaves the window wedged badly enough that the tab bar stops taking touches.
 * `PermissionAsks` records that failure in full; it was avoided until now by
 * there being exactly one modal in the permission flow. Today's details sheet
 * is a third, and `WelcomePopups` was already a second, so the invariant needs
 * a mechanism rather than a convention.
 *
 * A store rather than context: `PermissionAsks` and `WelcomePopups` are mounted
 * in different subtrees (the tabs shell and the Today screen), and a provider
 * spanning both would have to live above the router.
 *
 * Claim is **atomic and non-reentrant-safe**: a claim by the current owner
 * succeeds, a claim by anyone else fails, and only the current owner can
 * release — so a losing surface cannot free a host it never held.
 */
export type ModalOwner = 'permissions' | 'welcome' | 'today-details';

export const useModalOwner = create<{ owner: ModalOwner | null }>(() => ({ owner: null }));

export function claimModal(owner: ModalOwner): boolean {
  const current = useModalOwner.getState().owner;
  if (current !== null && current !== owner) return false;
  useModalOwner.setState({ owner });
  return true;
}

export function releaseModal(owner: ModalOwner): void {
  if (useModalOwner.getState().owner === owner) useModalOwner.setState({ owner: null });
}
