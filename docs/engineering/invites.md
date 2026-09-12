# Invite links and the invite-code budget — the rules in full

Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**The invite link is unchanged by the above.** The universal-links chain has
three sources and every failure is silent: `ios.associatedDomains` in
`app.config.ts`, the extensionless AASA file's `Content-Type`
(`web/vercel.json`), and the **Associated Domains capability on the App ID** in
Apple's portal. EAS CNG generates the native entitlement from config; never
hand-edit the ignored `ios/` project. Same failure class as `aps-environment`.
The domain is a one-way door — `INVITE_HOST` is one constant that both
`app.config.ts` and `invite-message.ts` read, and changing it breaks every link
already shared. Runbook: `web/README.md`.

**Guessing an invite code costs a daily budget, and `join_squad` returns null
now, as of 2026-09-08** (deviation #71, issue #34). `rate_limits (user_id,
action, window_date, attempts)` with no client grant, charged by
`consume_rate_limit(p_action, p_limit)` inside the RPC; `join_squad` and
`preview_squad` both spend the `invite_code` action, thirty a day. Nine things
break easily:

- **A raise and a counter cannot coexist in one transaction, and that is why
  the contract changed.** `join_squad` raised `22023` for an unknown code; an
  exception aborts the transaction, so the increment recording the guess is
  rolled back with it, the counter only ever advances on the calls that
  *succeeded*, and the limit never trips — silently, with every test about
  refusing a bad code still green. The miss path returns **null**, and
  `useJoinSquad` turns that into the sentence 22023 used to produce. Do not
  "restore" the raise.
- **Over-budget returns the same null**, so the two answers are identical by
  construction rather than by two branches that agree today: one return
  statement, no code, no message. `NO_SUCH_SQUAD` in `mutations.ts` is one
  constant for the same reason. Nothing may ever say "too many attempts" —
  `CONTEXT.md` carries that as a vocabulary rule.
- **`preview_squad` shares the budget**, which is one step past the ticket's
  "inside the join RPC" and the difference between a control and theatre: it
  answers the same question for any authenticated caller *and* hands back the
  squad's name, so limiting only the join leaves the enumeration door open and
  closes the one you walk through afterwards holding the answer. One action key,
  because a budget per door is a budget an attacker picks the larger of.
- **It is `volatile` now and that is load-bearing.** PostgREST runs a STABLE
  function in a read-only transaction on the GET path, where the charge fails
  outright.
- **The window is the UTC date, alone in this codebase.** Everything else is
  keyed by the player's own local day (§2); `profiles.timezone` is in the
  client's column-level UPDATE grant, so a local-day window would be a reset
  button. A rate limit is the one place the account's own claim about when its
  day ends cannot be the authority.
- **Charged before the lookup, and the over-budget attempt is charged too.**
  Charging afterwards lets an exhausted account still join on the guess that
  finally lands, which is the outcome the budget exists to prevent. A legitimate
  join spends two of thirty — one preview, one join — which is the best case
  rather than the bound: a mistyped code previews too, and `useSquadPreview`'s
  `retry: 2` can charge three for one attempt. Thirty rather than a number
  closer to two because the failures are not symmetrical — thirty guesses a day
  against 2.18e9 is the same nothing ten is, while a false refusal tells an
  honest person their correct code is wrong in the sentence built to give them
  no way to find out otherwise.
  The `20` is a commented literal for `users_needing_digest()`'s seven-day
  reason: SQL cannot import from the keystone, and no client may know the
  number, since a client counting down to a published bar would undo the whole
  indistinguishability property.
- **Built for a second caller.** `send_whack` takes the same shape in Phase 3
  (deviation #70), so the next one adds a string rather than a mechanism. It
  resolves the account from `auth.uid()` rather than taking a `p_user_id`, for
  `delete_account()`'s reason — an identity argument is one accidental grant
  from letting a caller spend, or clear, somebody else's budget.
- **What it does not buy, and say so rather than implying otherwise.** The
  counter is per account and accounts are cheap — anonymous sign-in is enabled
  on the project, and `preview_squad` needs only a session where `join_squad`
  also needs a profile. Enumeration now costs one account per thirty tries
  instead of nothing, and the free unlimited existence oracle is gone; that is
  the whole claim. A floor on the identity itself (App Attest) is still owed.
  There is also **no pruning path**: one row per account, action and UTC day,
  forever, reached only by `delete_account()`'s cascade. It is small, and a
  sweep belongs with the next job that needs one rather than with this.
- **The OTA ships before the migration, and the order is not symmetric.** An old
  client against the new schema reads `data: null` with no error, hands it to
  `onSuccess` and dereferences `squad.program` — a crash on an ordinary mistyped
  code. A new client against the old schema is fine, because the old one still
  raises 22023 and the mapping is still there. **No Edge Function bundles either
  RPC**, so nothing redeploys; `seed-health` inserts membership directly and
  names `join_squad` only in a comment.
