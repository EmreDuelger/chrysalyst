import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    typecheck: {
      enabled: true,
    },
    coverage: {
      provider: 'v8',
    },
  },
});
