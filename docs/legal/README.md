# Legal drafts

Workstream D6. §15 lists the privacy policy and ToS under **V1**, but external
TestFlight testers need both and they have a lead time measured in days — so
they are drafted here now, during D, rather than written at the Apple gate (E7).

| File | What it is |
|---|---|
| `privacy-policy.md` | Draft privacy policy |
| `terms-of-service.md` | Draft terms of service |
| `privacy-nutrition-labels.md` | The App Store Connect answers, which follow from the policy |

**These are drafts by an engineer, not legal advice, and not reviewed by
counsel.** Every one of them is written against what the schema and the Edge
Functions actually do as of 2026-08-08, which is the part that is expensive to
get right and easy to get wrong; the legal framing around it is the part a
Philippine data-privacy practitioner should look at before anything ships.

## Decisions still open — these are yours, not drafting choices

Each appears as `[[TODO: …]]` in the drafts. They are blanks, not oversights:
they change what the documents *promise*, so guessing would be worse than
leaving them visible.

| # | Blank | Why it cannot be defaulted |
|---|---|---|
| 1 | **Personal Information Controller** — you personally, or a registered entity | Under the Data Privacy Act the PIC is who is accountable and who NPC correspondence goes to. Naming an entity that does not exist yet is worse than naming yourself. |
| 2 | **Contact address for privacy requests** | Must be monitored. Apple requires a working contact, and the DPA gives subjects a right to reach you. |
| 3 | **Retention period for health buckets and scores** | Drafted as "for as long as the account exists, then erased on deletion". If you want a rolling window (say 24 months of `health_buckets`), that is a cron job and a policy line, and it is cheaper to decide before there is history. |
| 4 | **Whether a Data Protection Officer is designated** | The DPA requires one of PICs processing personal data; sensitive personal information raises the stakes. Likely you, at this scale. |
| 5 | **Governing jurisdiction for the ToS** | Drafted as the Philippines. |
| 6 | **Whether beta data survives into production** | Anonymous accounts are swapped for Sign in with Apple at E5, and the anonymous rows are not portable to the new identity. Say so before the beta, not after. |

## The one thing not to change without re-reading the schema

The policy's central claim — *squadmates see tiers and totals, never raw steps,
hourly movement or timestamps* — is not a promise the app tries to keep. It is a
property of the projection: `profiles` is owner-readable only, and
`squad_leaderboard()` / `squad_feed()` have no argument that returns raw steps
or hourly movement. If a future change widens either projection, the policy
becomes false at the same moment, and it is the policy that will be read in
court. Phase 7 follow-up #1 (making the All-Rounder squad-visible) is exactly
such a change and is deferred partly for this reason.
