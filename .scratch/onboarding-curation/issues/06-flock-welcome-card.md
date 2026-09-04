# 06: The flock ask, as a fourth welcome card

**What to build:** Kairo is a race, and a new account lands on Today with an
empty sky and no prompt to fill it. Give the social loop a first-day chance.

The ask arrives as a **fourth card in the welcome run that already plays on
Today** after onboarding: *"Flying alone is fine. It's better with a flock."*
with three real options — paste an invite code, invite a friend, or not now.
None of them dark; not-now is frictionless.

It is deliberately **not** a separately leased first-run sheet. The welcome
cards are already a once-ever first-run modal on Today leasing the same root
view controller, so a second one would mean a brand-new account meets both on
the same first focus, one loses the lease, and the loser reappears later out of
context. As a fourth card it needs no new modal owner, no second once-ever
marker, and no ordering rule between two first-run surfaces.

The card list gains an optional actions slot that only this entry uses; the
other three stay linear reads with a next button.

**A known and accepted loss, which must be recorded in a comment.** The welcome
run's marker is set when the run *opens*, not when it finishes, so a player who
force-quits before reaching the fourth card never sees it. It is **not** moved
to the front to fix this — asking someone to recruit friends before the game has
been explained is the ask arriving before its why. A second marker would fix it
and reintroduce exactly the two-surface ordering problem this arrangement
avoids. The loss is bounded, because the Sky tab's flock rail carries a
permanent trailing invite slot, so a missed card costs a nudge rather than the
feature. Write the reasoning down so the next reader does not helpfully repair
it into the version that was rejected.

The card's answer is recorded — joined, invited, or skipped. It rides the
welcome run's existing once-ever marker and needs none of its own, because the
card cannot be reached twice.

**Blocked by:** None (can start immediately).

**Status:** done (2026-09-04)

- [x] A fourth welcome card offers paste-a-code, invite-a-friend and not-now,
      all three functional
- [x] It is a card in the existing run, not a separate sheet, and claims no new
      modal lease
- [x] Only one native sheet is ever on screen in a frame; the permission ask and
      Today's details sheet still cannot collide with it
- [x] The other three cards are unchanged and still linear reads
- [x] A comment records why the card is last, why the interrupted-run loss is
      tolerated, and why a second marker was rejected
- [x] The answer is recorded as joined, invited or skipped, with no other payload
- [x] The deviations table records the flock prompt's placement, with the reason
- [ ] Accessibility structure checked in the Accessibility Inspector; verified
      at the largest accessibility content size with the app relaunched
      — **outstanding, needs a human**: this machine cannot drive the simulator
      UI, and the sheet is unbounded by design (it grows with its copy, the
      2026-08-17 lesson), so the fourth card's three stacked controls are the
      thing to look at at XXXL, with the app relaunched after the size change.
