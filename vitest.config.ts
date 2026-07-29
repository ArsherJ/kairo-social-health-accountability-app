import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Schema tests plus the pure halves of the Edge Functions. The Deno
    // handlers themselves are thin and excluded; everything that makes a
    // decision lives in _shared and runs here in plain Node.
    //
    // The app's pure modules run here too — routing and permission decisions
    // are plain functions for exactly that reason. They must not import
    // native modules or the `@/` alias, neither of which resolves here.
    include: [
      'supabase/tests/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    // PGlite boots a WASM Postgres and replays every migration per suite.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
