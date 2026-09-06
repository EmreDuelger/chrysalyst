import { describe, expect, it } from 'vitest';

import pkg from '../package.json' with { type: 'json' };
import { app } from './app.ts';

describe('app', () => {
  it('answers GET /health with ok and the manifest version', async () => {
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      version: pkg.version,
    });
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('answers 404 for an unknown route', async () => {
    const response = await app.request('/does-not-exist');

    expect(response.status).toBe(404);
  });
});
