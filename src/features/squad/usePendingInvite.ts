import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { takePendingInvite } from './pending-invite-store.ts';

/**
 * Redeem an invite code that was stashed before the user had an account.
 *
 * Mounted in `app/(tabs)/_layout.tsx`, and the choice of host is the whole
 * mechanism: that layout only exists for a user `resolveRoute()` calls
 * `'ready'`, so mounting **is** the check that sign-in and onboarding both
 * finished. Same arrangement, and the same reasoning, as
 * `useNotificationRouting()`.
 *
 * The performing half of `pending-invite.ts`. It takes the code — reading and
 * clearing in one step — so a stash that is never acted on cannot re-open the
 * join screen on every launch for the rest of its hour.
 */
export function usePendingInvite(): void {
  const router = useRouter();
  // Once per mount. `router` is stable but the effect must not re-run on a
  // re-render, or a second take would find the entry already cleared and the
  // navigation would be lost.
  const claimed = useRef(false);

  useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;

    const code = takePendingInvite(Date.now());
    if (code === null) return;

    // Back to the route the link would have reached, rather than joining from
    // here. One screen owns the join, including the already-in-a-squad case
    // somebody may have entered during the gap — and the user still confirms.
    router.push(`/join/${code}`);
  }, [router]);
}
