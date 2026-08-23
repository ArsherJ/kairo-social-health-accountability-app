# EAS migration runbook

Kairo uses a two-gate cutover so the EAS account move and Continuous Native
Generation (CNG) are proven separately. Do not disable Xcode Cloud or remove the
committed iOS project until both TestFlight gates pass.

`package.json` disables Expo Doctor's generic "app config fields not synced"
check while the native directories remain in Git for the two gates. The
migration instead verifies CNG by generating fresh native projects and checking
their capabilities explicitly; all other Doctor checks remain enabled in CI.

## Current project identity

These values stay unchanged across the account move:

- EAS project ID: `ccfa0966-3aa9-4548-b5a2-6e311816d8de`
- Expo slug: `kairo`
- iOS bundle ID: `com.arsherj.kairo`
- Android package: `com.arsherj.kairo`
- Apple team: `8C53KVSFWK`

The target Expo organization is `kairo-health`, managed from the new Expo user
`4r.sher`. At the time this runbook was written, `eddytion47` was an Admin of
that organization but the project still resolved as `@eddytion47/kairo`.

## 1. Transfer the existing EAS project

In the Expo dashboard, signed in as `eddytion47`, transfer `kairo` to
`kairo-health`. Do not create or initialize another project. In the dashboard,
confirm that the transferred project still has the project ID shown above.

Next, change `owner` in `app.config.ts` from `eddytion47` to `kairo-health`.
Only after the dashboard transfer and local owner change, sign the CLI in as
`4r.sher` and verify:

```bash
eas whoami
eas project:info
```

The second command must report `@kairo-health/kairo` and the same project ID
shown above. A stale `owner` prevents the CLI from resolving the transferred
project, which is why the local change comes before this CLI check. Keep
`eddytion47` as an organization Admin until both TestFlight gates pass.

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

Leave `ios/` tracked and do not create `.easignore` yet. Build and submit:

```bash
npm run eas:build:ios:production
```

The command uses EAS auto-submit, so TestFlight receives the exact artifact
produced by that build instead of whichever build happens to be latest.

The workflow in `.eas/workflows/ios-production.yml` performs the same verified
build and TestFlight submission on pushes to `main`.

On the TestFlight build, verify launch, Sign in with Apple, the HealthKit
permission sheet, a foreground sync, background observer delivery, production
push entitlement, and the universal invite link. A green cloud build alone is
not this gate.

## 4. Gate B — prove CNG

After Gate A passes, copy `docs/easignore-cng.template` to `.easignore`. Its
`/ios/` and `/android/` entries make EAS generate both projects from
`app.config.ts` and the project-owned config plugins. Keep the local committed
`ios/` directory temporarily as rollback material; it is excluded from the EAS
upload rather than deleted.

Run another iOS production build and submit it to TestFlight. Repeat the Gate A
device checks. In addition, compare the generated archive's capabilities:

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

## 6. Retire Xcode Cloud only after both gates

Once both TestFlight builds pass:

1. Disable the Xcode Cloud workflow.
2. Stop tracking `ios/` and keep both native directories ignored/generated.
3. Remove the Xcode Cloud-only scripts and documentation after confirming no
   EAS step references them.
4. Remove `eddytion47` from `kairo-health` if it no longer needs access.

OTA updates remain disabled until a separate runtime-version and rollback plan
is approved.
