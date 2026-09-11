/** Presentation only. The eventual send RPC must independently enforce this. */
export function whackEarned({ tiers, verifiedSessionToday }: {
  tiers?: Readonly<Record<string, string>>;
  verifiedSessionToday: boolean;
}): boolean {
  return tiers?.STR === 'gold' || verifiedSessionToday;
}
