# Kairo

Kairo is a Philippines-market health accountability app, **solo-first**: an RPG character levels from your real HealthKit activity, and squads are an optional layer on top — a daily leaderboard, plus shared goals over a span of days, weeks, or years.

iOS first via Expo; Supabase backend.

## Docs

- [`docs/Kairo_Master_Summary.md`](./docs/Kairo_Master_Summary.md) — the product spec (v1.4). Sections are cited in code and docs as `§5`, `§12`, etc. **§5 and §6 describe the retired four-stat model**; Kairo scores three stats (AGI, STR, MND) as of 2026-08-20 and those sections carry build notes saying so — see deviation #41.
- [`docs/roadmap.md`](./docs/roadmap.md) — build sequencing, phase status, and the approved-deviations table (deliberate, recorded departures from the spec).
- [`docs/user-journey.md`](./docs/user-journey.md) — the end-to-end user flow: onboarding → daily loop → character → squad → goals.
- [`docs/mvp-scope.md`](./docs/mvp-scope.md) — **what is in the MVP and what is not.** Cite it in any QA brief, test plan or store-facing copy; a brief describing something not listed there is stale.
- [`docs/qa/kairo-end-to-end-qa-report.md`](./docs/qa/kairo-end-to-end-qa-report.md) — the August 2026 QA pass, with an addendum tracing its central finding to a stale Edge Function deployment.
- [`docs/sign-in-with-apple.md`](./docs/sign-in-with-apple.md) — the runbook for rotating and installing the Apple client secret.
- [`docs/eas-migration.md`](./docs/eas-migration.md) — the completed EAS/CNG cutover, build identities, and remaining account cleanup.
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
npm run doctor           # Expo project/config diagnostics

npm run ios              # build + run on simulator
npm run prebuild         # regenerate ignored native projects from Expo config
npm run xcode-env        # rewrite ios/.xcode.env.local (see below)
npm run eas:build:ios:production      # EAS build + submit to TestFlight
npm run eas:build:android:development # EAS development APK smoke build
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
curl -I https://kairo-teal-nine.vercel.app/.well-known/apple-app-site-association
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
is skipped entirely: physical-device builds go through **EAS Build → TestFlight**.
EAS archives the app and App Store Connect distributes it over the air; no step
touches USB. Sign in with Apple and HealthKit work in that build, which is why a
physical device is still required for their system-level checks. The completed
cutover and verified build IDs are in `docs/eas-migration.md`.

**`ios/` and `android/` are generated and ignored.** `app.config.ts` plus the
project-owned config plugins are the native source of truth, and EAS uses CNG to
generate both projects. For local simulator/Xcode work, `npm run prebuild`
materialises them; commit the config or plugin change, never the generated
native output.

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
runs automatically after `npm run prebuild`; `postinstall` also invokes it and
cleanly skips when a fresh clone has no generated `ios/` yet. Run it by hand
after changing node versions. The generated file remains local because it holds
a machine-specific absolute path.

### The app icon is two assets, and only one of them is checked at build time

iOS 26 draws the icon with Liquid Glass, which needs a layered source rather
than a picture of an icon. So there are two:

| File | Used by | Shape |
| --- | --- | --- |
| `assets/Kairo.icon/` | iOS (`ios.icon`) | Icon Composer bundle — a **transparent** terracotta symbol plus `icon.json`, which declares the cream ground as `fill`. iOS renders the light, dark and tinted appearances from it. |
| `assets/icon.png` | Android, web, pre-iOS-26 (root `icon`) | Flat 1024×1024, ground baked in, square corners, **no alpha channel**. |

Four things about the bundle fail quietly:

- **The `.icon` path belongs on `ios.icon`, as a plain string.** Expo warns and
  falls back if it is given to the root `icon` field, or nested in the
  light/dark/tinted object form.
- **Nothing in the JS toolchain reads `icon.json`.** `prebuild` copies the
  directory verbatim into `ios/Kairo/Kairo.icon` and sets
  `ASSETCATALOG_COMPILER_APPICON_NAME`. The schema is Apple's, and only
  `actool` checks it — at Xcode/EAS build time. A malformed edit therefore
  survives `npm run prebuild`, `npm run typecheck` and `expo config`, then
  fails in CI. Validate it in a couple of seconds instead:

  ```bash
  mkdir -p /tmp/iconcheck   # actool errors out rather than creating it
  xcrun actool --compile /tmp/iconcheck --platform iphoneos \
    --minimum-deployment-target 26.0 --target-device iphone \
    --app-icon Kairo --output-partial-info-plist /tmp/iconcheck/p.plist \
    assets/Kairo.icon
  ```

  Non-zero exit means a bad schema. On success it writes the actual rendered
  icons to `/tmp/iconcheck/` — the only way to *see* the glass treatment
  without a device. `xcrun assetutil --info /tmp/iconcheck/Assets.car` lists
  the appearance variants that were generated.
- **`fill` colours are `<colour-space>:r,g,b,a` floats, not hex.**
  `extended-srgb:0.96078,0.91765,0.84706,1.00000` is `colors.bg` (`#f5ead8`)
  from `src/theme.ts`. A hex string is silently wrong.
- **The directory basename is the icon name**, so renaming `Kairo.icon`
  renames the build setting too.
- **Editing the artwork without editing `app.config.ts` leaves the native copy
  stale, silently.** `prebuild` copies the bundle into `ios/Kairo/Kairo.icon`;
  `npm run ios` does *not* re-sync it, because the config *value*
  (`'./assets/Kairo.icon'`) has not changed — only the bytes it points at have.
  The build then succeeds against the previous icon. After changing any icon
  asset, run `npx expo prebuild -p ios` (add `--no-install` to keep `Pods/`),
  and `xcrun simctl uninstall booted com.arsherj.kairo` before reinstalling,
  since SpringBoard caches icons across reinstalls. Confirm the native copy
  really changed rather than trusting the build:

  ```bash
  # first strongly-opaque pixel of each; they must match
  sips -g all assets/Kairo.icon/Assets/icon.png ios/Kairo/Kairo.icon/Assets/icon.png
  ```

**The Dark appearance is auto-derived, and currently reads poorly.** iOS 26 lets
people set Home Screen icons to Dark (Home Screen → Customize → Dark). With only
one layer declared, the system darkens the cream ground but keeps the symbol
unchanged. That is why the symbol is terracotta (`colors.accent`) rather than
ink (`colors.text`): ink measured 13.95:1 on cream but **1.00:1** on the
darkened ground — invisible, and confirmed that way on the simulator.
Terracotta reads 3.03:1 and 4.60:1 respectively, which is the only split a
single-layer icon can reach. Changing the symbol to a darker, higher-contrast
colour silently breaks the Dark appearance again.

Overriding a single appearance is what the `*-specializations` keys in
`icon.json` are for (`fill-specializations`, `image-name-specializations`,
`glass-specializations` …, keyed by `light-color` / `dark-color` / `dark-tint` /
`dark-clear`). **Do not hand-write them from that vocabulary alone.** An
invented nesting was tried and is a silent no-op: `actool` exits 0 while
ignoring it, proven by pointing a specialization at a file that does not exist —
it still succeeded, where the same trick on the *primary* `image-name` fails the
build outright. Author appearance overrides in Apple's Icon Composer
(`/Applications/Xcode.app/Contents/Applications/Icon Composer.app`), which
writes canonical JSON, or change the symbol to a mid-tone that survives both
grounds. Note also that `actool` output is **nondeterministic** — the same input
compiles to different digests — so diffing `Assets.car` cannot tell you whether
an edit took effect.

The PNG has one trap of its own: it must carry **no alpha channel at all**.
Apple rejects an App Store icon that has one even when every pixel is opaque
(ITMS-90717), and that is raised at upload, not at build — so a
flattened-but-still-RGBA file passes everything local and fails submission.
Most export paths add the channel back; confirm with `sips -g hasAlpha
assets/icon.png`.

See `CLAUDE.md` for environment constraints (why `supabase db push` / `psql` / `supabase start` don't work on this dev machine), architecture, and testing conventions before making changes.
