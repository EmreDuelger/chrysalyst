import type { CoreDependencies, InterviewState } from '@chrysalyst/core';
import { describe, expect, it } from 'vitest';

import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app.ts';

/**
 * Dependencies this suite's routes never reach. Every port refuses rather than
 * pretends, so a route that quietly started using one fails here instead of
 * passing over a double that agreed with it.
 */
function untouchedDependencies(): CoreDependencies<InterviewState> {
  const refuse = (): never => {
    throw new Error('the app shape reaches no dependency');
  };
  return {
    llm: { status: refuse, complete: refuse, stream: refuse },
    sessions: { list: refuse, load: refuse, save: refuse },
    clock: { now: refuse },
  };
}

describe('app', () => {
  it('answers GET /health with ok and the manifest version', async () => {
    const app = createApp(untouchedDependencies());

    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      version: pkg.version,
    });
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('answers 404 for an unknown route', async () => {
    const app = createApp(untouchedDependencies());

    const response = await app.request('/does-not-exist');

    expect(response.status).toBe(404);
  });
});
