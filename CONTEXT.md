# Kairo — domain glossary

The words Kairo means, and the words it refuses. This file is a glossary and
nothing else: no schema, no file paths, no implementation. When a term here
conflicts with a term in code, the code is wrong or this file is stale, and one
of the two gets fixed in the same pass.

Authorities for everything that is *not* vocabulary: `docs/Kairo_Master_Summary.md`
for intent, `docs/roadmap.md` for approved deviations, `docs/mvp-scope.md` for
what is in the build.

---

## The player and the character

**Character** — the animal that levels from your real activity. It has no noun
of its own: it is "your character", or its given name. Never a Hunter, never an
avatar, never a pet.

**Kairo** — the app, and by extension the character when it is speaking. The
character speaks in sentences about itself; the app does not speak as an app.

**Level** — all-time progression from XP, stat-agnostic. What the character *is*.

**Mastery** — per-stat lifetime accumulation, one figure per stat. It never
falls, because a number that falls punishes the quiet week and the quiet week is
who this product is for. It therefore measures *accumulated practice*, not
current form.

> Superseded: **ability rating**. The old name asserted current capability, which
> is precisely what a monotone lifetime figure cannot measure. Same mechanic,
> honest label.

**Living Mirror** — the character as the interface: the day read back as where
the character is standing, how heavily it stands there, and how it slept, rather
than as a list of figures beside it. What the player sees first every day.

---

## The three stats

Each has a **player word** and an **engine key**. The player word is what any
screen, brief, test plan or store listing must use. The engine key appears in the
database and nowhere a player can see.

**Motion** (`AGI`) — getting about. Steps and distance.

**Body** (`STR`) — physical work. Active calories, and time spent in a verified
strength session, which is the more efficient route to the same ceiling.

> Body is *not* a synonym for the engine key's older reading. Until this pass it
> meant active calories alone, which made it a second Motion wearing a different
> name. "Strength" still legitimately names a *squad program* and a *Challenge
> area* — those are games, not stats, and members joined a squad under that name.

**Mind** (`MND`) — recovery. Sleep duration. The one stat that can be
**unreachable**, because it needs a sleep source the phone alone does not have.

**Stat** — one of exactly those three. Not an attribute, not a skill.

---

## A day

**Local day** — midnight to midnight in the player's own timezone. A squad spans
several at any instant; this is never the squad's day.

**Score** — what a local day was worth. It ranks the board and feeds XP and
Mastery. **It is spoken nowhere.** The player reads their day in real units —
steps, calories, hours slept — never as a total.

**Tier** — Bronze, Silver, Gold: the anchors a stat's raw value is judged
against. Internal to scoring. No surface names one, and no surface colours one.

**Ceiling** — the most a day can be worth. Identical with and without a wearable:
a sleep source buys a third *route* to the ceiling, never a higher one.

**Headroom** — what a day does past the ceiling. It pays the character and never
the ranking, because the cap is the anti-cheat.

**Crest** — the character's visible state on a day that went past the ceiling.
Lasts that day only.

**Record** — a personal best on one stat, kept permanently. Yours alone; it is
not a leaderboard and never appears on one.

**Spread** — moving across many hours rather than in one burst. It makes Motion's
bands easier to reach, up to a limit. It is a *consequence the player is told
about*, not a hidden modifier: an unexplained difficulty change reads as a bug in
the score.

**Motion location** — where the character is standing today, from the day's
steps against the **Daily Walk** figure: **branch**, **treeline**, **valley**,
**climb**, **ridge**. Five bands, one number, said as a place rather than a
percentage.

**Climb** — the fourth band, three quarters of the way. Named so that **ridge**
keeps its one meaning.

**Ridge** — the top band, and the day's finish. It is the same figure as the
**Daily Walk** and the race's **finish line** — one number with three readings,
never a shifted one. Reaching it is spoken once, by the walk.

**Capability** — whether a stat can be earned at all. Only Mind can lack it.
A stat the player cannot earn is never asked of them — not by a quest, not by a
prompt, and not by a blank card that reads as an accusation.

---

## Together

**Squad** — up to six people. Never a barkada, party, clan or team.

**Race** — the day drawn as one shared sky, everyone flying at one **finish
line**, which is the same figure as the Daily Walk and the **ridge**. Ranked by **capped** steps:
past the line, more steps buy nothing.

**Ghost** — one of your own past days, raced when you have no squad.

**Program** — the stat a squad has chosen to weight. Never a "focus".

**Battle** — the one kind of **Event** that ships: a pooled fight, measured in
active calories, against a **boss** and its **HP**. Everyone on the roster is
paid when the bar fills, contributor or not — being carried is a reason to be in
a squad.

**Consent** — permission to show a squadmate your daily totals. Reciprocal and
per person: you see theirs when they have agreed *and* you have.

---

## Starting out

**Beat** — one screen of the onboarding run. The run is a sequence of beats and
nothing else: a beat says one thing, and adding a thing means adding a beat.

**Phase** — a stretch of beats that share a purpose: what this is, letting it
in, your choices, the name. **The progress rail measures phases, not beats**, so
a run of four and a run of seven both read as four segments and adding a beat
never makes the run look longer than it is.

**Calibration** — the one-time reading of the player's own recent step history,
taken on the phone at the moment Health is granted, that proposes how big their
daily quests should start. It is local: the days it reads are never stored and
never sent. It can decline to answer — a fortnight with nothing in it means *we
could not measure you*, which is a different sentence from *we measured you and
you are starting small*, and the two are never merged.

**Seed** — a value read once at the start and never re-derived. The opposite of
a **rule**, which recomputes every time it is read and whose bar therefore rises
as the player improves. Calibration is a seed: the same trailing median that is
refused as a rule is safe as a seed, because nothing re-reads it. This is the
distinction that keeps the two consistent, and it is the word to reach for
before adding anything that "adapts".

---

## Alone

**Daily Walk** — a flat, permanent daily step figure. A public-health number, so
it never scales with the player. The same figure as the **ridge** and the race's
finish line. Missing it breaks the **run** and costs nothing else.

**Daily Walk run** — consecutive days the Daily Walk was cleared. **Not the
streak**, and never called one: they are different values, and one screen shows
both.

**Streak** — consecutive days that scored. A **shield** covers one miss so a rest
day does not undo a month.

**Challenge** — a personal target in one area, derived fresh from your own recent
sessions every time it is read, and never stored as a level. It moves both ways:
a quiet stretch lowers it.

**Quest** — one of three small daily targets, derived from the day and the
account rather than stored. A garnish on the loop, never a cheaper route through
it.

**Digest** — the one scheduled push a day, in the morning, in the player's own
timezone.
