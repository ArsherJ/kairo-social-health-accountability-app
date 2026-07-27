import { defineConfig } from 'vitest/config';

// Explicit so the repo-root config (which targets the Supabase schema tests)
// is not picked up by Vitest's upward config search.
export default defineConfig({
  test: {
    root: __dirname,
    include: ['src/**/*.test.ts'],
  },
});
