# EAS migration runbook

Kairo completed its two-gate EAS account and Continuous Native Generation (CNG)
cutover on 2026-08-23. EAS now generates both native projects from
`app.config.ts` and the project-owned config plugins; `ios/` and `android/` are
ignored locally and excluded from EAS uploads.

The temporary Expo Doctor suppression used while native directories remained
tracked has been removed. The ordinary Doctor checks now validate the active
CNG repository shape in CI.

## Current project identity

These values stay unchanged across the account move:

- EAS project ID: `ccfa0966-3aa9-4548-b5a2-6e311816d8de`
- Expo slug: `kairo`
- iOS bundle ID: `com.arsherj.kairo`
- Android package: `com.arsherj.kairo`
- Apple team: `8C53KVSFWK`

The EAS project was transferred to `kairo-health` on 2026-08-23 without changing
its project ID. The organization is managed from the Expo user `4r.sher`.
Removing `eddytion47` as an organization Admin is optional pending account
cleanup; it is not part of the completed repository cutover.

## 1. Transfer the existing EAS project — completed 2026-08-23

In the Expo dashboard, signed in as `eddytion47`, transfer `kairo` to
`kairo-health`. Do not create or initialize another project. In the dashboard,
confirm that the transferred project still has the project ID shown above.

Next, change `owner` in `app.config.ts` from `eddytion47` to `kairo-health`.
This repository now contains that change. Only after the dashboard transfer and
local owner change, sign the CLI in as `4r.sher` and verify:

```bash
eas whoami
eas project:info
```

The second command must report `@kairo-health/kairo` and the same project ID
shown above. A stale `owner` prevents the CLI from resolving the transferred
project, which is why the local change comes before this CLI check.
`eddytion47` remained an organization Admin through both TestFlight gates.

## 2. Configure EAS environments and credentials

Add both variables to the EAS `development` and `production` environments:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use the same values as the existing working deployment. They are client-facing
configuration, never a Supabase secret/service-role key. The EAS dashboard is
preferred so values do not land in shell history.

Configure remote credentials under the transferred project:

```bash
eas credentials:configure-build --platform ios --profile ios-production
eas credentials:configure-build --platform android --profile development
```

The iOS build needs the existing Apple Developer team. Automated submission
also needs an App Store Connect API key with access to the existing Kairo app
record. Before the first EAS archive, set EAS's remote iOS build number to a
number at least as high as the latest TestFlight build; `autoIncrement` will use
the next number:

```bash
eas build:version:set --platform ios --profile ios-production
```

## 3. Gate A — build the committed iOS project

**Passed 2026-08-23:** EAS build 20 was processed as valid in TestFlight, and
the device checklist below passed in full.

During this historical gate, `ios/` remained tracked and `.easignore` did not
exist. The build was submitted with:

```bash
npm run eas:build:ios:production
```

The command uses EAS auto-submit, so TestFlight receives the exact artifact
produced by that build instead of whichever build happens to be latest.

The workflow in `.eas/workflows/ios-production.yml` performs the same verified
build and TestFlight submission on pushes to `main`.

The TestFlight checklist covered launch, Sign in with Apple, the HealthKit
permission sheet, a foreground sync, background observer delivery, production
push entitlement, and the universal invite link. A green cloud build alone was
not sufficient for this gate.

## 4. Gate B — prove CNG — passed 2026-08-23

EAS iOS build 21 was generated from Expo config and config plugins, processed
successfully in TestFlight, and passed the full device checklist.

- Build ID: `7b0bd494-4a00-4c5e-b789-d4746c9b02f4`
- Submission ID: `98475e53-dcf4-4b00-833a-086ded67c3d6`

The device pass verified launch, Sign in with Apple, HealthKit system
authorization, foreground and background sync, push delivery and tap routing,
and the universal invite link. The generated archive also retained:

- HealthKit and background-delivery entitlements
- Sign in with Apple
- production APNs environment
- associated domain for the invite host
- non-exempt encryption set to false
- Health permission descriptions
- React Native built from source

## 5. Android development smoke test

Android is intentionally development-only in this phase:

```bash
npm run eas:build:android:development
```

The profile produces an installable APK with Expo Dev Client. Android offers
the development-only anonymous sign-in path and identifies onboarding as a
smoke-test build. It does not request health permission, read device health,
create health observer subscriptions, or call the health-sync server path.
Google sign-in, Health Connect, App Links and Play Store production are separate
future gates.

## 6. Repository retirement — completed 2026-08-23

After Gate B passed, the Xcode Cloud workflow was deactivated. The repository
then stopped tracking `ios/`, kept both native directories ignored/generated,
removed the Xcode Cloud-only scripts and active runbook, and restored the normal
Expo Doctor native-config check. `app.config.ts` and config plugins are now the
durable native source of truth for both local prebuilds and EAS CNG.

Removing `eddytion47` from `kairo-health` remains optional account cleanup and
is not recorded as completed here.

OTA updates remain disabled until a separate runtime-version and rollback plan
is approved.
