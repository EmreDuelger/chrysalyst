import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  STATUS_ROUTE,
  browserBackendProbe,
  fetchBackendReadiness,
  type BackendReadiness,
} from './backend-status.ts';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

interface StatusFixture {
  readonly route: string;
  readonly readyFields: readonly string[];
  readonly reasonField: string;
  readonly reasons: readonly string[];
}

const fixture = JSON.parse(
  readFileSync(
    join(repoRoot, 'tests', 'fixtures', 'backend-status.json'),
    'utf8',
  ),
) as StatusFixture;

interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function recordingFetch(response: (call: Call) => Response): {
  readonly impl: typeof fetch;
  readonly calls: Call[];
} {
  const calls: Call[] = [];
  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: urlOf(input), init };
    calls.push(call);
    return Promise.resolve(response(call));
  }) as typeof fetch;
  return { impl, calls };
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const READY: BackendReadiness = {
  ready: true,
  backend: 'Ollama',
  model: 'llama3.2:3b',
};

describe('backend status probe', () => {
  describe('fetchBackendReadiness', () => {
    it('requests the status route', async () => {
      const { impl, calls } = recordingFetch(() => jsonResponse(READY));

      await fetchBackendReadiness(impl);

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe(STATUS_ROUTE);
    });

    it('resolves a ready response', async () => {
      const { impl } = recordingFetch(() => jsonResponse(READY));

      await expect(fetchBackendReadiness(impl)).resolves.toEqual(READY);
    });

    it('resolves an unreachable response', async () => {
      const body = {
        ready: false,
        backend: 'Ollama',
        model: 'llama3.2:3b',
        reason: 'unreachable',
      };
      const { impl } = recordingFetch(() => jsonResponse(body));

      await expect(fetchBackendReadiness(impl)).resolves.toEqual(body);
    });

    it('resolves a model-missing response', async () => {
      const body = {
        ready: false,
        backend: 'Ollama',
        model: 'llama3.2:3b',
        reason: 'model-missing',
      };
      const { impl } = recordingFetch(() => jsonResponse(body));

      await expect(fetchBackendReadiness(impl)).resolves.toEqual(body);
    });

    it('rejects a status other than 200, naming the route and the status', async () => {
      const { impl } = recordingFetch(() => jsonResponse(READY, 503));

      await expect(fetchBackendReadiness(impl)).rejects.toThrow(
        `GET ${STATUS_ROUTE}`,
      );
      await expect(fetchBackendReadiness(impl)).rejects.toThrow('503');
    });

    it('rejects a body whose "ready" is not a boolean', async () => {
      const { impl } = recordingFetch(() =>
        jsonResponse({ ready: 'yes', backend: 'Ollama', model: 'llama3.2:3b' }),
      );

      await expect(fetchBackendReadiness(impl)).rejects.toThrow(/ready/);
    });

    it('rejects a body whose "backend" is not a string', async () => {
      const { impl } = recordingFetch(() =>
        jsonResponse({ ready: true, backend: 7, model: 'llama3.2:3b' }),
      );

      await expect(fetchBackendReadiness(impl)).rejects.toThrow(/backend/);
    });

    it('rejects a body whose "model" is not a string', async () => {
      const { impl } = recordingFetch(() =>
        jsonResponse({ ready: true, backend: 'Ollama', model: null }),
      );

      await expect(fetchBackendReadiness(impl)).rejects.toThrow(/model/);
    });

    it('rejects a blocked body whose "reason" is absent', async () => {
      const { impl } = recordingFetch(() =>
        jsonResponse({ ready: false, backend: 'Ollama', model: 'llama3.2:3b' }),
      );

      await expect(fetchBackendReadiness(impl)).rejects.toThrow(/reason/);
    });

    it('rejects a blocked body whose "reason" is outside the two known faults', async () => {
      const { impl } = recordingFetch(() =>
        jsonResponse({
          ready: false,
          backend: 'Ollama',
          model: 'llama3.2:3b',
          reason: 'on-fire',
        }),
      );

      await expect(fetchBackendReadiness(impl)).rejects.toThrow(/reason/);
    });

    it('rejects a 200 answer whose body is not JSON, naming the route', async () => {
      const { impl } = recordingFetch(
        () =>
          new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      );

      await expect(fetchBackendReadiness(impl)).rejects.toThrow(
        `GET ${STATUS_ROUTE}`,
      );
    });
  });

  describe('browserBackendProbe', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('probes the status route through the global fetch', async () => {
      const { impl, calls } = recordingFetch(() => jsonResponse(READY));
      vi.stubGlobal('fetch', impl);

      await expect(browserBackendProbe()).resolves.toEqual(READY);
      expect(calls[0]?.url).toBe(STATUS_ROUTE);
    });
  });

  describe('fixture agreement', () => {
    it("matches the fixture's route, field names and fault names", async () => {
      expect(STATUS_ROUTE).toBe(fixture.route);

      const readyBody = Object.fromEntries(
        fixture.readyFields.map((field) => [
          field,
          field === 'ready' ? true : `${field}-value`,
        ]),
      );
      const { impl: readyFetch } = recordingFetch(() =>
        jsonResponse(readyBody),
      );
      await expect(fetchBackendReadiness(readyFetch)).resolves.toEqual({
        ready: true,
        backend: 'backend-value',
        model: 'model-value',
      });

      for (const reason of fixture.reasons) {
        const blockedBody = {
          ready: false,
          backend: 'Ollama',
          model: 'llama3.2:3b',
          [fixture.reasonField]: reason,
        };
        const { impl: blockedFetch } = recordingFetch(() =>
          jsonResponse(blockedBody),
        );
        await expect(fetchBackendReadiness(blockedFetch)).resolves.toEqual({
          ready: false,
          backend: 'Ollama',
          model: 'llama3.2:3b',
          reason,
        });
      }
    });
  });
});
