export type SignInProviderId = 'apple' | 'anonymous';

/**
 * Provider availability is a platform decision, not a rendering side effect.
 * Apple's native button happens to render nothing on unsupported platforms,
 * but leaving Apple in the Android provider list still claims the runtime has a
 * sign-in path that it cannot execute.
 */
export function providerIdsForRuntime(input: {
  platform: string;
  development: boolean;
}): SignInProviderId[] {
  const providers: SignInProviderId[] = [];

  if (input.platform === 'ios') providers.push('apple');
  if (input.development) providers.push('anonymous');

  return providers;
}
