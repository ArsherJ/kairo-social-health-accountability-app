// EAS runs this pre-install hook before every remote dependency install. It
// rejects unsupported build intent and missing public runtime configuration
// before CNG spends time generating a native project. Values are never logged.
const profile = process.env.EAS_BUILD_PROFILE;
const platform = process.env.EAS_BUILD_PLATFORM;
const requiredPublicConfig = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
];

if (platform === 'android' && profile !== 'development') {
  console.error(
    `Android builds are development-only during this migration; profile "${profile ?? 'unknown'}" is not allowed.`,
  );
  process.exit(1);
}

for (const name of requiredPublicConfig) {
  if (!process.env[name]?.trim()) {
    console.error(
      `${name} is missing or empty; configure it in the selected EAS environment.`,
    );
    process.exit(1);
  }
}
