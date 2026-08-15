# Kairo Notion documentation — design

Date: 2026-08-15
Status: approved, pending implementation

## Purpose

Kairo's documentation lives in the repo (`Kairo_Master_Summary.md`, `docs/roadmap.md`,
`docs/mvp-scope.md`, `docs/user-journey.md`, and the rest of `docs/`) as prose files,
several thousand lines long, git-only. The user wants a second, browsable surface in
Notion: high-level → low-level, chunked into small pages rather than long single-file
reads, with visual diagrams (mermaid), and dedicated Tasks/Backlog and Decisions
tracking — kept current by asking Claude Code to sync it after doc-worthy work,
rather than by a hook.

This is **a second surface, not a second source of truth**. The repo docs remain
authoritative; Notion pages summarize and link back to them (`Source` callout on every
page), per the user's explicit choice over a full mirror.

## Structure

One root page, **"Kairo"**, created as a private workspace page. Everything else is a
child page or database under it, so no single page is a long scroll:

```
Kairo (hub — intro, table of contents, sync-convention callout)
├── Overview & Status
├── Architecture
├── Data Model & Schema
├── User Flows
├── Features (hub)
│   ├── Character & Progression
│   ├── Solo Mode
│   ├── Squads & Leaderboard
│   ├── Goals
│   ├── Notifications
│   ├── Auth
│   └── Accessibility
├── Decisions Log            (database)
├── Known Landmines
├── Tasks & Backlog          (database)
├── Changelog
└── Reference & Links
```

### Page content, by page

- **Overview & Status** — one paragraph on what Kairo is (solo-first PH health
  accountability RPG, HealthKit-driven, squads optional), current phase from
  `docs/roadmap.md`'s phase table, and a one-line "what's next."
- **Architecture** — system diagram (Expo app ↔ Supabase Edge Functions ↔ Postgres ↔
  HealthKit, `packages/kairo-core` shared by both consumers), the scoring/data-flow
  diagram (HealthKit → `sync-health` → `health_buckets` → `daily_scores` → XP/ratings →
  leaderboard), and a condensed list of the server-authoritative invariants from
  CLAUDE.md's "Structural invariants worth not breaking."
- **Data Model & Schema** — ERD (mermaid) covering `profiles`, `daily_scores`,
  `health_buckets`, `squads`, `squad_members`, `goals`, `goal_completions`,
  `workout_sessions`, `device_tokens`, `app_events`, with their key relations; a short
  section on the privacy/RLS projection model (`squad_leaderboard()`, owner-only tables).
- **User Flows** — mermaid flowcharts: onboarding (body → name → profile insert), the
  daily loop (sync → score → character update), squad join + leaderboard, goals
  lifecycle, notification routing (foreground/background/tap-from-terminated).
- **Features** — one child page per area (Character & Progression, Solo Mode, Squads &
  Leaderboard, Goals, Notifications, Auth, Accessibility), each a short synthesis of
  the corresponding CLAUDE.md section(s) plus a Source callout.
- **Decisions Log** (database) — one row per approved roadmap deviation (#1 onward):
  `Title`, `Date`, `Status`, `Source` (link into `docs/roadmap.md`'s deviations table).
  Structured, filterable, not prose.
- **Known Landmines** — condensed list of the environment/build gotchas that have cost
  real debugging time (RN built from source, `ios/` committed, USB pairing blocked,
  black-holed network requests, aps-environment), each two or three sentences with a
  link to the fuller account.
- **Tasks & Backlog** (database) — `Name`, `Status` (Backlog/Planned/In
  Progress/Blocked/Done), `Area` (Character/Squad/Goals/Auth/Notifications/
  Backend/Accessibility/QA/Infra), `Priority` (P0/P1/P2), `Source`. Seeded one row per
  roadmap phase (0–11) at its current ✅/🟨 status, plus one row per item in the three
  "deferred, not blocking" follow-up lists (Phase 1, 4, 3, 7 follow-ups).
- **Changelog** — dated entries, newest first, appended on each sync ("2026-08-15:
  initial structure created" as the first entry).
- **Reference & Links** — links to the GitHub repo and to `Kairo_Master_Summary.md`,
  `docs/roadmap.md`, `docs/mvp-scope.md`, `docs/user-journey.md`.

## Keeping it current

Chosen mechanism: **on request, as a workflow step** — not a git hook, not fully
automatic. Two artifacts make this durable across sessions:

1. A line added to CLAUDE.md's "Documentation updates are part of the change" section,
   pointing at the Notion root page URL, so any session working on a doc-worthy change
   knows a Notion mirror exists and can be asked to sync.
2. A `project`-type memory recording the same convention and the root page URL, so
   Claude Code doesn't have to re-derive it each session.

No hook fires automatically; sync happens when the user asks (e.g. "update Notion") or
when Claude Code finishes a feature and flags it as doc-worthy and the user agrees.

## Out of scope

- Full verbatim mirroring of repo docs into Notion (explicitly declined).
- Automatic sync on every commit (explicitly declined).
- A second implementation of any diagram/data outside this repo's own docs — every
  diagram here is a rendering of facts already established in CLAUDE.md / roadmap.md /
  the schema, not new design work.
