import { createSingleTurnInterview } from '@chrysalyst/core';
import type { CoreDependencies, InterviewState } from '@chrysalyst/core';
import { Hono } from 'hono';

import pkg from '../package.json' with { type: 'json' };
import { createInterviewRoutes } from './routes/interview-routes.ts';

/**
 * Builds the HTTP surface of `@chrysalyst/server` over the dependencies the
 * domain runs on.
 *
 * A factory rather than a module-scope instance, because concrete adapters are
 * constructed only at the entry point: that is what lets a route test build an
 * app over a fake model and a temporary session directory instead of reaching
 * a real inference backend and the user's home directory.
 *
 * Every route is chained onto one expression so the returned type carries the
 * whole surface, and {@link AppType} is derived from this function rather than
 * declared beside it — there is no second place from which a route could be
 * missing.
 */
export function createApp(deps: CoreDependencies<InterviewState>) {
  return new Hono()
    .get('/health', (c) => c.json({ status: 'ok', version: pkg.version }))
    .route('/', createInterviewRoutes(createSingleTurnInterview(deps)));
}

export type AppType = ReturnType<typeof createApp>;
