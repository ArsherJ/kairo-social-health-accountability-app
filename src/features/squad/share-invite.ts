import { Share } from 'react-native';
import { inviteUrl } from './invite-link.ts';
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
 * Universal links landed 2026-08-17 (deviation #36), and the prediction held —
 * the message gained a URL and nothing else here changed except `url`, which
 * had been left empty with a note saying there was nothing to put in it.
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
        // Set as well as being inside `message`, not instead of it. Targets
        // split on this: Messages and Mail attach the URL as a rich preview and
        // send the message alongside, while others (Notes, some chat apps)
        // take only `message` — so the link has to be in both or it is missing
        // from whichever the user actually picked.
        url: inviteUrl(input.inviteCode),
      },
      { subject: inviteTitle(input.squadName) },
    );
  } catch {
    // Dismissing the sheet rejects on some targets, and a failed *share* is not
    // a failed anything: the code is still on screen behind it. Swallowing this
    // is deliberate — an error toast for "changed my mind" is worse than
    // silence.
  }
}
