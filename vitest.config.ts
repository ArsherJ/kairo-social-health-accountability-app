import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    // PGlite boots a WASM Postgres and replays every migration per suite.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
