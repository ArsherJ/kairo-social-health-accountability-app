/**
 * Whether the stored zone should be replaced by the device's.
 *
 * Split out from the hook that uses it because root Vitest cannot parse
 * React Native's Flow syntax or resolve the `@/` alias — a single native
 * import anywhere in this file's module graph would make it untestable.
 * Same split as permission-state.ts and route.ts.
 */
export function shouldUpdateTimezone(
  stored: string | undefined,
  device: string,
): boolean {
  if (!stored) return false;
  if (!device) return false;
  return stored !== device;
}
