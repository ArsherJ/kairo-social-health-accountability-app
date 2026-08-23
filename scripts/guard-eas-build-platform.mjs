const profile = process.env.EAS_BUILD_PROFILE;
const platform = process.env.EAS_BUILD_PLATFORM;

if (platform === 'android' && profile !== 'development') {
  console.error(
    `Android builds are development-only during this migration; profile "${profile ?? 'unknown'}" is not allowed.`,
  );
  process.exit(1);
}
