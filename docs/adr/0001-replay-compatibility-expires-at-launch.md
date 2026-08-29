# 1. Replay compatibility is not worth protecting yet, and that expires at launch

Date: 2026-08-29

## Status

Accepted.

## Context

Kairo stores health data as hourly buckets and **replays** every score from them
rather than adjusting scores in place. That property is load-bearing and is not
in question: it is what makes retries, Apple's retroactive step revisions, and
cron overlap all safe.

A *second*, weaker property has been riding on it and has been treated with the
same reverence: that a scoring change must leave **already-scored history**
comparable to newly-scored days. It is why the three-stat switch was arranged so
`4 x 900 = 3 x 1,200` kept the daily ceiling exactly where it was, why END and
VIT became threshold shifts rather than being deleted, and why several tuning
questions have been answered "no" without the trade being priced.

That constraint has a beneficiary: a user whose past days would silently change
meaning under them. Queried on 2026-08-29, the live project holds **3 profiles
and 6 scored days**, all of them development accounts. There is no such user. The
constraint is currently pure cost — it has been narrowing the design space of a
product that has no history to protect.

It will stop being pure cost the moment a real cohort exists, and at that point
it becomes very expensive to reacquire, because the alternative is rescoring
strangers' months.

## Decision

Until Kairo has a real user cohort, **a scoring change may move stored history**,
and comparability with previously-scored days is not a reason to reject one. The
replay mechanism itself stays exactly as it is.

This licence **expires at first real cohort** — the first day the project holds
scored days belonging to people who are not the team. From that day, a scoring
change that moves stored history requires a migration that rescores, or it does
not ship.

Two guards stay in force regardless, because they protect correctness rather than
comparability:

- A migration touching a table an Edge Function writes ships with that function's
  redeploy, in the same pass.
- The schema suite continues to insert the planner's real output, so engine drift
  fails at commit time rather than in production.

## Consequences

**Good.** The scoring model can be fixed rather than worked around. Three
long-standing problems become tractable in one pass: Body measuring calories
instead of physical work, the dead zone between tier anchors, and Mind's cliff.
Tuning arguments get decided on merit instead of on a compatibility cost nobody
is paying.

**Bad.** This is a dated judgement that will read as recklessness to anyone who
finds it later without the number attached — which is exactly why the number is
written down above. There is also no automated enforcement of the expiry: it is a
human checkpoint, and a forgotten one silently converts into the reckless version
of itself.

**Mitigation.** The launch checklist in `docs/mvp-scope.md` carries the expiry as
an explicit item. The first scoring change proposed after a real cohort exists
should be checked against this ADR before it is designed, not after.

## Alternatives considered

**Keep comparability unconditionally.** Safest, and the status quo. Rejected
because it pays a real design cost for a benefit that provably accrues to nobody
today, and because it was never a decision — it was an assumption inherited from
a spec written when the product was different.

**Drop it permanently.** Rejected outright. It would mean a user's past months
could be silently reinterpreted by any future tuning pass, which is a worse
betrayal than a visible rescore.

**Version the scoring engine and replay each day under the engine it was scored
with.** The principled answer, and genuinely correct. Rejected as premature: it
is meaningful ongoing complexity in every scoring path, bought to preserve six
development days. Worth revisiting if the app ever needs a second scoring change
after launch.
