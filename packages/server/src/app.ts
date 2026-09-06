import { Hono } from 'hono';

import pkg from '../package.json' with { type: 'json' };

/**
 * The HTTP surface of `@chrysalyst/server`. For now it carries only a liveness
 * probe; later features mount their routes on this same instance. The routes are
 * chained on construction so `typeof app` captures them for a typed `hc` client.
 */
const app = new Hono().get('/health', (c) =>
  c.json({ status: 'ok', version: pkg.version }),
);

export type AppType = typeof app;

export { app };
