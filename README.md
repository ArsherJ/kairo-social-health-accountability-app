# Kairo

Kairo is a Philippines-market health accountability app, **solo-first**: an RPG character levels from your real HealthKit activity, and squads are an optional layer on top — a daily leaderboard, plus shared goals over a span of days, weeks, or years.

iOS first via Expo; Supabase backend.

## Docs

- [`Kairo_Master_Summary.md`](./Kairo_Master_Summary.md) — the product spec (v1.4). Sections are cited in code and docs as `§5`, `§12`, etc.
- [`docs/roadmap.md`](./docs/roadmap.md) — build sequencing, phase status, and the approved-deviations table (deliberate, recorded departures from the spec).
- [`docs/user-journey.md`](./docs/user-journey.md) — the end-to-end user flow: onboarding → daily loop → character → squad → goals.
- [`docs/mvp-scope.md`](./docs/mvp-scope.md) — **what is in the MVP and what is not.** Cite it in any QA brief, test plan or store-facing copy; a brief describing something not listed there is stale.
- [`docs/qa/kairo-end-to-end-qa-report.md`](./docs/qa/kairo-end-to-end-qa-report.md) — the August 2026 QA pass, with an addendum tracing its central finding to a stale Edge Function deployment.
- [`docs/sign-in-with-apple.md`](./docs/sign-in-with-apple.md) — the runbook for the last release blocker: app side built, portal configuration and a device pass remaining.
- [`docs/xcode-cloud.md`](./docs/xcode-cloud.md) — how to get a build onto a phone when USB pairing is blocked by this machine's endpoint security. Not yet executed.
- [`CLAUDE.md`](./CLAUDE.md) — architecture, invariants, and working conventions for anyone (human or agent) changing this codebase.

## Quick start

```bash
npm install
npm run ios              # build + run on simulator (needs Xcode + CocoaPods)
```

## Commands

```bash
npm test                 # everything: kairo-core (node) + schema/planner suites
npm run test:core        # packages/kairo-core only
npm run test:schema      # schema (PGlite) + Edge Function planners
npm run typecheck        # tsc + workspace tsc + deno check, all three

npm run ios              # build + run on simulator
npm run prebuild         # regenerate ios/ from app.config.ts — COMMIT THE RESULT
npm run xcode-env        # rewrite ios/.xcode.env.local (see below)
npm run ci-scripts       # reinstall ios/ci_scripts/ from scripts/ci/ (postprebuild does this)
npm run apple-secret     # mint the Sign in with Apple client secret (see below)

./supabase/scripts/remote-sql.sh "select ..."      # SQL against the live project
supabase functions deploy <name> --project-ref zniopywbwenrzxezolwv
node supabase/scripts/smoke-sync.mjs               # post-deploy: does a sync still score?
```

### Deploying Edge Functions

**A migration that changes a table an Edge Function writes must ship with a
redeploy of that function.** Applying one without the other is what took
scoring down for two days in August 2026: `remove_sabotage` dropped
`daily_scores.sabotage_delta`, the deployed `sync-health` kept sending it, and
because its bucket upsert commits *before* the score upsert, health data
carried on landing while nothing scored. Every test passed the whole time —
they check the source, not what is deployed.

So after any such deploy:

```bash
supabase functions deploy sync-health --project-ref zniopywbwenrzxezolwv
node supabase/scripts/smoke-sync.mjs    # asserts buckets, score and rollups agree
```

The smoke check exercises the real function through a throwaway account and
deletes it afterwards. It fails loudly on exactly that signature: buckets
accepted, no score written. `docs/qa/kairo-end-to-end-qa-report.md` has the
full post-mortem.

### The invite-link site (`web/`)

Universal links need one JSON file served over HTTPS from a domain's root.
`web/` is that site — an `apple-app-site-association` file, a `vercel.json` that
forces its content type, and a landing page for anyone who taps an invite
without the app installed. Deploy it to any free static host.

**The deployed domain must match `ios.associatedDomains` in `app.config.ts`, or
every invite link falls back to Safari with nothing reporting an error.** Both
sides read a single `INVITE_HOST` constant so they cannot drift, and changing
that constant breaks every link already shared — it is baked into messages
already sent. `web/README.md` has the full runbook, including the four
manual steps in the entitlement chain and why GitHub Pages cannot host this.

```bash
curl -I https://<domain>/.well-known/apple-app-site-association
# expect 200, content-type: application/json, and no redirect
```

### Building onto a physical device

```bash
npx expo run:ios --device      # npm run ios targets the simulator
```

Two separate things have to be in place, and Xcode reports both as one error
(`Signing for "Kairo" requires a development team` /
`No code signing certificates are available to use`):

1. **The team**, which is `ios.appleTeamId` in `app.config.ts`. Setting it in
   Xcode's UI instead works until the next `expo prebuild --clean`, which
   deletes `ios/` wholesale.
2. **A signing certificate**, which is per-machine and cannot live in config:
   **Xcode → Settings → Accounts → `+` → Apple ID**, then select the team →
   **Manage Certificates… → `+` → Apple Development**.

`security find-identity -v -p codesigning` tells you whether the second one is
done — "0 valid identities found" means it is not. Two identical
`Apple Development` certificates is normal (Xcode makes one on sign-in, and
Manage Certificates can make another) and does not break signing; Apple caps
you at two, so revoke one before setting up a second Mac.

Then the device itself, checked with `xcrun devicectl list devices`:

1. Connect by USB — a **data** cable; a charge-only one never shows up and
   reports nothing.
2. Unlock the phone, tap **Trust This Computer?**, enter the passcode.
3. **Settings → Privacy & Security → Developer Mode → On**, then restart and
   confirm the alert with your passcode. Required on iOS 16+, and **the menu
   item does not appear until the phone has been plugged into a Mac running
   Xcode at least once** — so this cannot be done ahead of step 1.

**`devicectl` reports `No devices found` for every failure in this list, so read
the log rather than guessing which one you have:**

```bash
/usr/bin/log show --last 10m --style compact \
  --predicate 'process == "remotepairingd"' | grep -iE "pairing|consent"
```

- `ioreg -c IOUSBHostDevice -r -w0 | grep -i iPhone` returning nothing — the
  cable is charge-only, or the phone is not attached. Check this first; it rules
  out the whole layer. (`system_profiler SPUSBDataType` can return empty output
  for unrelated reasons and is not a reliable substitute.)
- `Not paired with anyone, failing pairVerify early` / `PairVerify client M2
  failed: get PK, -6727 kNotFoundErr` — **not a fault.** There is no pairing
  record yet, so the verify step is expected to fail; pairing falls through to
  PairSetup immediately after. Do not stop here.
- `Received pairing outcome awaitingUserConsent` followed within ~2s by
  `### Pairing failed: kCanceledErr` — **`kCanceledErr` does not mean you
  dismissed the prompt.** CoreDevice reports any channel that dies mid-handshake
  as a cancellation. Whether the *phone* dropped it or the *link* did is the
  whole question, and only the kernel log separates them:

  ```bash
  /usr/bin/log show --last 20m --style compact --predicate 'process == "kernel"' \
    | grep -E "enumerateDeviceComplete|terminateDevice|updateLinkStatus"
  ```

  - `AppleUSBNCMData::updateLinkStatus: linkStatus 0` at the failure timestamp
    **with no `terminateDevice`** — the phone tore down the pairing tunnel while
    staying attached over USB. That is a refusal, not a fault, and a ~1.5s gap
    from `awaitingUserConsent` is too fast to be a human dismissing a dialog:
    iOS is auto-declining without drawing it. Cause is a cached **Don't Trust**
    — iOS records the host's rejection and never re-prompts. Clear it with
    **Settings → General → Transfer or Reset iPhone → Reset → Reset Location &
    Privacy** (asks for the passcode, erases no data), then replug. Also check
    **Screen Time → Content & Privacy Restrictions**, which refuses the same way.
  - `terminateDevice: destroying 0x05ac/12a8/… (iPhone): hardware connection
    lost` *once* per plug-in, ~150ms after the first `enumerateDeviceComplete`
    and followed by a second one ~1s later, is the iPhone switching USB
    configuration on attach. **Normal.** Only a `destroy`/`enumerate` cycle
    repeating on its own, with nobody touching the cable, is a physical link
    fault. Enumeration at 480 Mbps is not a symptom either — Apple's bundled
    USB-C cable is USB 2.0.

  CoreDevice gets **one pairing attempt per plug-in**: on failure it logs
  `marked for removal` and stops tracking the device, so nothing retries and
  `devicectl` goes back to `No devices found`. Every retry needs a physical
  unplug and replug.

- `IOPortTransportState::_setAuthorizationStatus(): … 1 [Unauthorized]` —
  **not conclusive on its own.** The port passes through `Unauthorized` on every
  re-enumeration before settling on `2 [Policy Authorized]`. Only a status that
  *stays* unauthorized implicates System Settings → Privacy & Security →
  "Allow accessories to connect".

- `IOUC AppleUSBHostInterfaceUserClient failed MACF in process pid …, usbmuxd`
  in the kernel log — **a security agent is blocking pairing, and no amount of
  work on the phone will fix it.** MACF is the kernel's mandatory access control
  layer; a denial here means `usbmuxd` is refused the iPhone's USB interface by
  policy, so no lockdown record is ever written and the phone re-prompts
  "Trust This Computer?" on *every* plug-in. Check for an Endpoint Security
  extension:

  ```bash
  systemextensionsctl list | grep -A3 endpoint_security
  ```

  On a managed Mac this is typically CrowdStrike Falcon's Device Control module.
  The policy is server-side; the fix is an IT exception for Apple mobile devices
  (VID `0x05AC`), a personal Mac, or the over-the-air route below. Chrome or
  Spotify logging `openGated: failed to open iPhone…: provider is terminating`
  alongside it is unrelated noise — those are WebUSB probes hitting a device
  mid-teardown.

Developer Mode does not appear in Settings until a pairing has completed, so a
missing Developer Mode menu is a *symptom* of the above, not a separate problem
to chase.

**USB pairing is blocked on this machine and cannot be unblocked**, so the cable
is skipped entirely: **Kairo builds on Xcode Cloud and installs through
TestFlight.** Apple's machines archive the app and the App Store installs it —
no step touches USB. Setup and the operating rules are in `docs/xcode-cloud.md`;
EAS Build solves the same problem and was the alternative. Sign in with Apple
and HealthKit both work in such a build, which is the only reason a physical
device is needed here.

**`ios/` is therefore a committed directory** (roadmap deviation #28), not a
generated one — Xcode Cloud configures a workflow against a scheme that has to
exist in the repo. The consequence that bites: `app.config.ts` is no longer the
source of truth for native config. Changing `usesAppleSignIn`,
`NSHealthShareUsageDescription`, a plugin, or anything else native now needs
`npm run prebuild` **and a commit of the regenerated `ios/`**, or the change
silently never reaches the build.

After the first USB pairing, Xcode → Window → Devices and Simulators →
**Connect via network** makes it wireless.

Sign in with Apple and HealthKit both need a real device anyway; the simulator
throws `ERR_REQUEST_UNKNOWN` for the first and returns no data for the second.

### The Sign in with Apple client secret expires

Apple does not issue a client secret — it is an ES256 JWT signed with the `.p8`
key from the Developer portal, and **Apple caps its life at about 182 days**.
When it lapses, sign-in fails for every user at once and nothing in the
codebase will have changed, which makes it very hard to attribute after the
fact.

```bash
npm run apple-secret -- --key ~/AuthKey_ABC123DEFG.p8 --team-id YOUR_TEAM_ID --push
```

`--push` installs it on the Supabase project over the Management API so the
credential never reaches your scrollback. The script prints the expiry date;
put it in a calendar. Full runbook: `docs/sign-in-with-apple.md`.

### If an Xcode build fails with `line 9: : command not found`

`ios/.xcode.env` resolves node with `command -v node`, and Xcode runs script
phases under a restricted PATH that excludes Homebrew — so `NODE_BINARY` comes
out empty and the Hermes phase dies. Command-line builds are unaffected, which
makes it look like broken source rather than a broken environment.

`npm run xcode-env` writes `ios/.xcode.env.local` with an absolute path. It
runs automatically after `npm install` and `npm run prebuild`; run it by hand
after changing node versions. This one file stays uncommitted even though the
rest of `ios/` is now committed — it holds a machine-specific absolute path, so
it is per-machine by definition. Xcode Cloud regenerates it in
`ci_post_clone.sh`, which is why the Hermes phase does not fail there either.

See `CLAUDE.md` for environment constraints (why `supabase db push` / `psql` / `supabase start` don't work on this dev machine), architecture, and testing conventions before making changes.
