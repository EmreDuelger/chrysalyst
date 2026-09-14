import { describe, expect, it } from 'vitest';

import { createApp } from './app.ts';
import {
  backendDescriptorFromEnv,
  createDependenciesFromEnv,
} from './composition.ts';

/*
 * Live tier. Runs only when CHRYSALYST_LIVE_LLM holds a non-empty value; an
 * unset variable and an empty string both leave it disabled, matching every
 * other live suite in this package.
 *
 * This is the one case that falsifies § Decision's exact-match rule against a
 * real /v1/models payload: `readBackendReadiness` compares the configured
 * model id to the inventory Ollama reports, and a daemon that reports that id
 * in any other form — untagged, differently cased, aliased — fails here
 * rather than in a person's browser. No inference request is dispatched;
 * `GET /status` and `LlmPort.status` both only read the model inventory.
 */

describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')(
  'A running Ollama reports GET /status as ready for the configured model',
  { timeout: 30_000 },
  () => {
    it('answers ready: true, naming the configured backend and model', async () => {
      const dependencies = createDependenciesFromEnv();
      const backend = backendDescriptorFromEnv();
      const app = createApp(dependencies, backend);

      const inventory = await dependencies.llm.status();
      const reportedIds = inventory.available ? inventory.models : [];

      const response = await app.request('/status');
      const body: unknown = await response.json();

      console.info(
        `[backend-readiness] backend=${backend.name} model=${backend.model} daemonIds=${JSON.stringify(reportedIds)}`,
      );

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ready: true,
        backend: backend.name,
        model: backend.model,
      });
    });
  },
);
