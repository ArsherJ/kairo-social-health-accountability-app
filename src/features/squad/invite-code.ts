/**
 * Invite-code rules, mirroring the database CHECK `^[A-Z0-9]{6}$`.
 *
 * Codes get read aloud in group chats and retyped, so normalisation is
 * deliberately forgiving: case, surrounding space, and the dashes people add
 * to break up six characters are all stripped before validating. What reaches
 * `join_squad` is always the canonical form.
 *
 * Zero imports so root Vitest can load this — it has no `@/` alias and cannot
 * parse React Native's Flow syntax.
 */

export const INVITE_CODE_LENGTH = 6;

const VALID_CODE = new RegExp(`^[A-Z0-9]{${INVITE_CODE_LENGTH}}$`);

export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidInviteCode(raw: string): boolean {
  return VALID_CODE.test(normalizeInviteCode(raw));
}
