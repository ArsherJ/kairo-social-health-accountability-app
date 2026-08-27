/**
 * WCAG 2.1 contrast ratio, for the palette's tests.
 *
 * **Zero imports, deliberately.** Root Vitest has no `@/` alias and cannot
 * parse React Native's Flow syntax, so anything reaching `react-native` — or
 * `@/ui/index.ts`, which re-exports every component — is untestable there. Same
 * constraint that shaped `stat-names.ts`, `buffer.ts` and `milestones.ts`.
 *
 * This is a test helper and nothing renders with it. It lives under `src/ui`
 * rather than in the test file because `theme.ts` documents the ratios it
 * claims, and a reader following that comment should find the definition.
 */

/** `#rgb` or `#rrggbb`, any case, to three 0–255 channels. */
function channels(hex: string): [number, number, number] {
  const raw = hex.trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not an opaque hex colour: ${hex}`);
  }

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. The 0.03928 knee and 2.4 exponent are the spec's. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The ratio between two opaque colours, 1–21. Symmetric.
 *
 * **Opaque only.** `colors.border` is an 8-digit hex (`#201e1d29`) — a real
 * colour to React Native and not one this can measure, because the answer
 * depends on what is behind it. Passing one throws rather than silently
 * measuring the wrong thing.
 */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}
