import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    env: { TZ: 'America/Los_Angeles' },
    include: ['tests/**/*.test.ts'],
  },
});
