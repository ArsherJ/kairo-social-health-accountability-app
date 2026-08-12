import { Share } from 'react-native';
import { inviteMessage, inviteTitle } from './invite-message.ts';

/**
 * Hand the invite to whatever the user actually talks to their friends on.
 *
 * **React Native's own `Share`, and no clipboard dependency.** The iOS share
 * sheet already contains Copy, so `expo-clipboard` would add a native module —
 * and therefore a prebuild and a native rebuild — to duplicate a row the system
 * sheet gives away. It also puts Messenger and Viber one tap from the code,
 * which matters more in this market than a toast saying "copied".
 *
 * Universal links are the obvious next step and deliberately not this one:
 * they need a domain, a hosted `apple-app-site-association`, the associated-
 * domains entitlement and deep-link routing. This works today and does not
 * block that later — the message gains a URL and nothing else changes.
 */
export async function shareInvite(input: {
  squadName: string;
  inviteCode: string;
}): Promise<void> {
  try {
    await Share.share(
      {
        message: inviteMessage(input),
        title: inviteTitle(input.squadName),
      },
      // Nothing useful to offer here yet — with no URL there is no link to
      // print or mail as its own item.
      { subject: inviteTitle(input.squadName) },
    );
  } catch {
    // Dismissing the sheet rejects on some targets, and a failed *share* is not
    // a failed anything: the code is still on screen behind it. Swallowing this
    // is deliberate — an error toast for "changed my mind" is worse than
    // silence.
  }
}
