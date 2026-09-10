import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The API server's loopback address. The dev server proxies the interview
 * routes here so the browser sees a single origin under `pnpm dev`; the
 * production build carries none of this, because a proxy is dev-only.
 */
const apiServer = 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/interview': apiServer,
    },
  },
});
