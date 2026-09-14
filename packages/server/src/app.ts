import { createSingleTurnInterview } from '@chrysalyst/core';
import type { CoreDependencies, InterviewState } from '@chrysalyst/core';
import { Hono } from 'hono';

import pkg from '../package.json' with { type: 'json' };
import {
  type BackendDescriptor,
  readBackendReadiness,
} from './backend-readiness.ts';
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
 *
 * The backend descriptor is a parameter for the same reason the dependency set
 * is: a route that resolved it from the environment itself would be a second,
 * independent resolution of configuration the composition root already owns,
 * and nothing would hold the two in agreement. Passed down, the model the gate
 * names is by construction the model the adapter will send.
 *
 * `/health` and `/status` stay separate routes. The first reports that this
 * process is alive and reaches no dependency; the second reaches the language
 * model. Folding them together would report the server dead whenever a daemon
 * it does not own is stopped.
 */
export function createApp(
  deps: CoreDependencies<InterviewState>,
  backend: BackendDescriptor,
) {
  return new Hono()
    .get('/health', (c) => c.json({ status: 'ok', version: pkg.version }))
    .get('/status', async (c) =>
      c.json(await readBackendReadiness(deps.llm, backend)),
    )
    .route('/', createInterviewRoutes(createSingleTurnInterview(deps)));
}

export type AppType = ReturnType<typeof createApp>;
