import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    typecheck: {
      enabled: true,
    },
    coverage: {
      provider: 'v8',
      exclude: ['**/*.test-d.ts'],
    },
  },
});
