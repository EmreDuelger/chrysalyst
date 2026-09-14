import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  CoreDependencies,
  InterviewState,
  LlmPort,
} from '@chrysalyst/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app.ts';
import {
  BACKEND_PROBE_DEADLINE_MS,
  type BackendDescriptor,
} from './backend-readiness.ts';

/*
 * The status route's scenarios, driven through the app a browser calls rather
 * than through the readiness rule directly: the deadline, the fault mapping and
 * the JSON body are only worth asserting where a client actually meets them.
 *
 * The wire vocabulary is read from the fixture both packages share, so a
 * renamed field, a renamed fault or a moved route fails this run rather than
 * only a browser.
 *
 * Every port but the one under test refuses rather than pretends, so a route
 * that quietly started reaching inference, the session store or the clock fails
 * here instead of passing over a double that agreed with it.
 *
 * The deadline case advances Vitest's fake clock, which replaces
 * `globalThis.setTimeout` and nothing else. `AbortSignal.timeout` holds a native
 * timer that never routes through that clock, so a deadline built from it would
 * burn the full 2.0 s here and assert nothing about the bound. A refactor that
 * reintroduces it MUST be refused rather than accommodated.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const statusContractShape = z.object({
  route: z.string(),
  readyFields: z.tuple([z.string(), z.string(), z.string()]),
  reasonField: z.string(),
  reasons: z.tuple([z.string(), z.string()]),
});

const fixture: unknown = JSON.parse(
  readFileSync(
    join(repoRoot, 'tests', 'fixtures', 'backend-status.json'),
    'utf8',
  ),
);
const contract = statusContractShape.parse(fixture);

const STATUS_ROUTE = contract.route;
const [READY_FIELD, BACKEND_FIELD, MODEL_FIELD] = contract.readyFields;
const REASON_FIELD = contract.reasonField;
const [UNREACHABLE_FAULT, MODEL_MISSING_FAULT] = contract.reasons;

const BACKEND: BackendDescriptor = { name: 'Ollama', model: 'llama3.2:3b' };

const inventoriesWithoutTheModel: readonly {
  readonly inventory: readonly string[];
}[] = [
  { inventory: [] },
  { inventory: ['mistral:7b'] },
  { inventory: ['llama3.2:latest'] },
];

function llmWhoseStatusIs(status: LlmPort['status']): LlmPort {
  const refuse = (): never => {
    throw new Error('the status route reaches no inference');
  };
  return { status, complete: refuse, stream: refuse };
}

function statusApp(llm: LlmPort) {
  const refuse = (): never => {
    throw new Error('the status route reaches no session store and no clock');
  };
  const dependencies: CoreDependencies<InterviewState> = {
    llm,
    sessions: { list: refuse, load: refuse, save: refuse },
    clock: { now: refuse },
  };
  return createApp(dependencies, BACKEND);
}

async function expectUnreachable(response: Response): Promise<void> {
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    [READY_FIELD]: false,
    [BACKEND_FIELD]: BACKEND.name,
    [MODEL_FIELD]: BACKEND.model,
    [REASON_FIELD]: UNREACHABLE_FAULT,
  });
}

describe('GET /status', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers 200 and ready with the descriptor's backend and model, reaching no inference", async () => {
    const app = statusApp(
      llmWhoseStatusIs(() =>
        Promise.resolve({
          available: true,
          models: ['mistral:7b', BACKEND.model],
        }),
      ),
    );

    const response = await app.request(STATUS_ROUTE);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({
      [READY_FIELD]: true,
      [BACKEND_FIELD]: BACKEND.name,
      [MODEL_FIELD]: BACKEND.model,
    });
    expect(body).not.toHaveProperty(REASON_FIELD);
  });

  it('answers 200 and the unreachable fault, still naming the backend and the model', async () => {
    const app = statusApp(
      llmWhoseStatusIs(() => Promise.resolve({ available: false, models: [] })),
    );

    const response = await app.request(STATUS_ROUTE);

    await expectUnreachable(response);
  });

  it.each(inventoriesWithoutTheModel)(
    'answers the model-missing fault for $inventory',
    async ({ inventory }) => {
      const app = statusApp(
        llmWhoseStatusIs(() =>
          Promise.resolve({ available: true, models: inventory }),
        ),
      );

      const response = await app.request(STATUS_ROUTE);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        [READY_FIELD]: false,
        [BACKEND_FIELD]: BACKEND.name,
        [MODEL_FIELD]: BACKEND.model,
        [REASON_FIELD]: MODEL_MISSING_FAULT,
      });
      expect(MODEL_MISSING_FAULT).not.toBe(UNREACHABLE_FAULT);
    },
  );

  it('abandons a probe after the deadline and reports it unreachable, and reports a rejected probe the same way', async () => {
    const rejecting = statusApp(
      llmWhoseStatusIs(() =>
        Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:11434')),
      ),
    );

    await expectUnreachable(await rejecting.request(STATUS_ROUTE));

    let handedSignal: AbortSignal | undefined;
    const stalling = statusApp(
      llmWhoseStatusIs(
        (signal) =>
          new Promise((_resolve, reject) => {
            handedSignal = signal;
            signal?.addEventListener(
              'abort',
              () => {
                reject(new Error('the probe was abandoned'));
              },
              { once: true },
            );
          }),
      ),
    );

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = Promise.resolve(stalling.request(STATUS_ROUTE));
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(BACKEND_PROBE_DEADLINE_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);

    const expired = await pending;
    vi.useRealTimers();

    expect(handedSignal?.aborted).toBe(true);
    await expectUnreachable(expired);
  });

  it('answers GET /health with ok while the model rejects every probe', async () => {
    const status = vi.fn(() =>
      Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:11434')),
    );
    const app = statusApp(llmWhoseStatusIs(status));

    const alive = await app.request('/health');

    expect(alive.status).toBe(200);
    expect(await alive.json()).toEqual({ status: 'ok', version: pkg.version });
    expect(status).not.toHaveBeenCalled();

    await expectUnreachable(await app.request(STATUS_ROUTE));
    expect(status).toHaveBeenCalledTimes(1);
  });
});
