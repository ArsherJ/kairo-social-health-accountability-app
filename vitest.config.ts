import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Schema tests plus the pure halves of the Edge Functions. The Deno
    // handlers themselves are thin and excluded; everything that makes a
    // decision lives in _shared and runs here in plain Node.
    include: ['supabase/tests/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    // PGlite boots a WASM Postgres and replays every migration per suite.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
