# 2. A whack touches the bird, never the day

Date: 2026-09-06

## Status

Accepted.

## Context

Sabotage was removed on 2026-08-09. It had been the product's original premise —
§20's principle #4 called it "the soul of the product" — and it went because a
day you earned must not be reducible by another player's tap. The decision was
recorded as "progress is still progress", and a good deal of the codebase's
current shape follows from it.

On 2026-09-06 a six-persona evaluation panel found that nothing pulls a lapsed or
solo player back except one scheduled push and one friend's message, and the same
day the founder decided that Body should earn **a whack at a friend**. A whack is
antagonistic on its face. A future reader who knows the sabotage decision will
find this mechanic in the code and reasonably conclude that it was quietly
reversed.

It was not. This ADR exists so that the line is written down where the next
person to propose crossing it will find it.

## Decision

A whack changes **what the target's character does**, and **nothing the target
earned**.

Specifically, and exhaustively: it may present a reaction on the target's
character, mark the target's row in the flock for the day, and send one ordinary
budgeted push. It may not touch the score, the XP, the level, the streak, the
streak shield, the race position, the Mastery totals, the quest set, or any
stored figure the target produced. It is derived from the sender's own day and
stored as a row that only records that it happened.

## Considered options

**A whack that moves the target on the race picture** (read-time only, no stored
change). Rejected. Crossing the finish line *is* clearing the Daily Walk — one
number with two readings — so a bird drawn behind the line on a 10,000-step day
is a lie the Sky tab tells about a public-health figure. The lie would be
cosmetic and the confusion would not.

**A whack that costs the target points or XP.** Rejected. This is sabotage, and
the 2026-08-09 decision governs it. It is recorded here as the option it is, so
that a later "just make it cost them a little" is understood as a reversal
requiring its own ADR rather than as tuning.

**No whack at all**, and re-engagement left to the digest. Rejected on the
panel's evidence: the digest is a scheduled message from the app, and the thing
the product lacks is a reason to come back that *another person* caused.

## Consequences

**Good.** The one mechanic in the product that reaches across players carries no
capacity to harm, so it needs no forgiveness mechanic, no appeal, no cap on
damage and no exemption from the streak rules. The target's mute is therefore
about interruption rather than protection, which is why it is scoped to the push
and why there is no way to become invisible in a squad — an invisibility switch
in a six-seat flock leaks by absence, and there is nothing to hide from.

**Bad.** A mechanic that cannot hurt is a mechanic that can be ignored, and the
whack may simply not be felt. That is a real risk and it is accepted: the
alternative shapes all buy their stakes by reintroducing the thing that was
deliberately removed. If the whack is ignored, the answer is better copy, a
better reaction and a better picture — not stakes.

**Also bad.** "Whack" is an affectionate word doing load-bearing work. If the
vocabulary drifts toward *attack*, *damage*, *revenge* or *hit points*, the
mechanic will follow the words. A copy test bans those terms for that reason,
and it is guarding the decision in this ADR rather than a matter of taste.
