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
falls, because a number that falls punishes the **quiet week**. It therefore
measures *accumulated practice*, not current form.

> Superseded: **ability rating**. The old name asserted current capability, which
> is precisely what a monotone lifetime figure cannot measure. Same mechanic,
> honest label.

**Growth stage** — the character's body at a band of **Level**: four of them,
and the only thing about the character that changes shape. It is what a level-up
*looks like*; **Mastery** and **Level** are what it counts. It rides on the
three poses that actually draw — idle, walk and run — because the base render is
unreachable on the day screen and a stage applied to it would be a change nobody
could see. The four are named `hatchling`, `fledgling`, `juvenile` and `adult`;
those words label the artwork and the asset lab, and no player surface speaks
them. *(Decided 2026-09-06; the render path built 2026-09-07, and the nine
images landed 2026-09-08, so every stage now draws its own body.)*

**Philippine eagle** — what the character *is*. Every character is one
(deviation #55), and the app **prints** it in exactly one place: a line under
the name on the You tab, from `speciesLine()`. It is a fact, not a feature —
never a species readout, never a fact card, and never a second noun for the
character, which still has none. (A flock row has *spoken* the species through
`leaderboardRowLabel` since deviation #40. Said, not shown, and it stays.)

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
It is also the one stat that does something *for another*: a **rested** night
lowers what Body asks of you today.

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

**Crest** — two things, and they are worth keeping apart. Capital-C, it is the
character's visible state on a day that went past the ceiling: it changes the
**sky**, lasts that day only, and is always paired with a sentence saying why.
Lowercase, it is the fan of feathers on the bird's head — an anatomical part,
which the Rive artboard has always named that way. The **plumage** is what the
lowercase one carries.

**Plumage** — the crest's hue, taken from the dominant stat: Motion, Body or
Mind, from `STAT_COLORS`. It reads **lifetime** points rather than the fortnight
`useDominantStat` measures, because a flock row can only see the lifetime
figures and one player must not wear two crests. A player whose stats are level
takes none, for the reason a lane is not chosen for them either. It is the
crest and never the body — the figure already says four things by shape, and a
fifth would make the centrepiece a readout. *(Built 2026-09-07.)*

**Counted source** — an app whose steps Kairo adds up: the phone and watch that
recorded them, plus a short list of bridges. Anything else is **not counted**,
which is a statement about Kairo's list and never about the player — no flag, no
suspicion, nothing lost but the steps, and the player is told which app so the
list can grow. *(Built 2026-09-06.)*

**Counting** — how a day's activity becomes Kairo's figures, told to the player
in one place: which sources are **counted**, what is **typed in** and left out,
where the day stops (the **ridge**), and what a **flag** means. It names no
threshold: the bar an hour is judged against is never published.

**Typed in** — a figure a person wrote into the Health app by hand, rather than
one a sensor recorded. Kairo does not read it: it is excluded at the query, on
every quantity read, so a typed-in number is not a day that was scored and then
discounted — it is a day that never happened. The word for what is left is
**recorded**, never "verified", which already means something narrower about a
workout's source. *(Built 2026-09-06.)*

**Flag** — the mark on a local day whose hours do not look like human movement.
A social signal and never a score reduction: the day still scores, still pays
the character and still counts for the streak; what it cannot do is set a
**best day**, and squadmates see the mark on that day's row. It is about that
day only — the next day starts clean. The bar an hour is judged against is
never named to the player.

**Best day** — a personal best on one stat, kept permanently. Yours alone; it is
not a leaderboard and never appears on one.

> Superseded: **record**. The You tab already said "Your best days" while every
> other surface said "record", so one of the two was always going to be read as
> a second mechanic. The plainer word won. *(Decided 2026-09-06; the rename is
> not yet complete in code.)*

**Spread** — moving across many hours rather than in one burst. It makes Motion's
bands easier to reach, up to a limit. It is a *consequence the player is told
about*, not a hidden modifier: an unexplained difficulty change reads as a bug in
the score.

**Rested** — a night that slept well enough to make **Body**'s bands easier for
the day that follows. Like **spread**, it is a *consequence the player is told
about* and never a hidden modifier; unlike spread, it needs a sleep source, so
most phone-only accounts will never meet the word. It never touches Motion, and
so never touches the **ridge**. *(Decided 2026-09-06, not yet built.)*

**Motion location** — where the character is standing today, from the day's
steps against the **Daily Walk** figure: **branch**, **treeline**, **valley**,
**climb**, **ridge**. Five bands, one number, said as a place rather than a
percentage.

**Climb** — the fourth band, three quarters of the way. Named so that **ridge**
keeps its one meaning.

**Ridge** — the top band, and the day's finish. It is the same figure as the
**Daily Walk** and the race's **finish line** — one number with three readings,
never a shifted one. Reaching it is spoken once, by the walk.

**Summit** — the drawing of the character standing at the **ridge**, and
nothing else. Development vocabulary: no surface speaks it, exactly as no
surface speaks a growth stage's name. It exists because the pose needed a name
and **ridge** was already carrying three meanings; a fourth would have made the
word useless. It is a *persistent* look rather than a celebration — crossing the
line still fires the walk's one reaction, and this is what the figure settles
into for the rest of the day.

**Shift** — a signal making another reading's bands *easier*, never its points
larger. There are exactly two: the **spread**, where movement across many hours
lowers Motion's ladder, and the **rested** night, where sleep lowers Body's. A
shift is always a discount on a bar, so it is always spoken as one — "tops out
sooner", never a new target. It is never a multiplier: a stored multiplier
stacks with the **program**'s read-time weight.

**Rested** — a night at or past the hours Mind itself calls a full one, spoken
of the night and never of the player. It buys a shift on **Body** and nothing
else — it does not move Mind's own bands, it does not move Body's calories, and
it moves no Motion figure at all, so the **Daily Walk**, the **ridge** and the
race are untouched by it. It reaches only players who own something that
measures their sleep, which is a minority, and the app says so rather than
letting the rest discover a mechanic that never fires for them.

**Capability** — whether a stat can be earned at all. Only Mind can lack it.
A stat the player cannot earn is never asked of them — not by a quest, not by a
prompt, and not by a blank card that reads as an accusation.

---

## Together

**Squad** — up to six people. Never a barkada, party, clan or team.

**Race** — the day drawn as one shared sky, everyone flying at one **finish
line**, which is the same figure as the Daily Walk and the **ridge**. Ranked by **capped** steps:
past the line, more steps buy nothing.

**Ghost** — one of your own past days, raced when you have no squad. On the
sky it is a **faded** bird and is named by its day — "your Saturday" — never by
a name; the sky says in words that faded birds are your own recent days.

**Program** — the stat a squad has chosen to weight. Never a "focus".

**Battle** — the one kind of **Event** that ships: a pooled fight, measured in
active calories, against a **boss** and its **HP**. Everyone on the roster is
paid when the bar fills, contributor or not — being carried is a reason to be in
a squad.

> **Retired 2026-09-06**, and the word goes with it — see
> `docs/superpowers/specs/2026-09-06-road-to-high-rating-design.md`. What it was
> *for* survives as the flock's **cleared** count: one mark per member who
> cleared the **Daily Walk** today, which is the one true cooperative sentence a
> flock can say about itself. Banked Battle XP is kept; the noun is not.
> This entry stays until the removal ships, because until then the word is still
> on screen.

**Whack** — a poke sent to one squadmate, earned by your own day. It changes
**what their character does** — a reaction, a mark on their row for the day, one
ordinary push — and **nothing they earned**: not the score, the streak, the race,
the Mastery or the XP. That line is the whole term, and it is what separates a
whack from the retired sabotage; it is recorded as `docs/adr/0002`.
*Never* an attack, a hit, damage, or revenge.
*(Decided 2026-09-06, not yet built.)*

**Whack back** — answering a whack with your own. It needs your own day to have
earned one, which is the entire loop: the only way to answer is to move.
*(Decided 2026-09-06, not yet built.)*

> There is no noun for the thing a day earns. It is deliberately unnamed: a
> player reads "you can whack again tomorrow", never a quantity. Naming it would
> make it feel bankable, and a currency with a wallet is the coin-pack problem in
> a new dress. _Avoid_: charge, token, energy, credit.

**Consent** — permission to show a squadmate your daily totals. Reciprocal and
per person: you see theirs when they have agreed *and* you have.

**Invite code** — the six characters that are the whole authorisation to join a
squad. An account gets a bounded number of tries a day (issue #34), and
**a refusal is never named**: a spent budget and a wrong code produce the same
sentence, because the only reader who benefits from telling them apart is the
one guessing. _Avoid_, on every surface: "too many attempts", "rate limit",
"try again tomorrow".

---

## Starting out

**Beat** — one screen of the onboarding run. The run is a sequence of beats and
nothing else: a beat says one thing, and adding a thing means adding a beat.

**Phase** — a stretch of beats that share a purpose: what this is, letting it
in, your choices, the name. A phase decides where Skip lands and which beats
are the value cards; it no longer decides what the progress rail draws.
**Progress is shown one step per beat** — the run is as long as it is, and a
beat added later makes it visibly longer. *(Until 2026-09-14 progress was shown
in phases so adding a beat never lengthened the run; testers read a
part-filled phase as a stalled run, and the rule was retired.)* The **hatch**
is not a step of its own: it is the same step as the ask it follows.

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
timezone. It reaches a solo player too, and says nothing about rank to one.

**Lapsed** — an account with no scored day in seven local days. It stops the
**Digest** and nothing else: the account is not degraded, not demoted and not
told, and the first scored day ends it, with nothing stored to reset. Not a
**quiet week**.

**Quiet week** — a player who is here and scoring little. The product is built
for them, and three things say so: **Mastery** never falls, a **Challenge**
moves down as readily as up, and the **shield** covers a missed day. A quiet
week scores, so it is never **lapsed**.
