import type { LlmRequest } from '@chrysalyst/core';
import { describe, expect, it } from 'vitest';

import {
  createOpenAiCompatibleLlm,
  llmConfigFromEnv,
} from './openai-compatible-llm.ts';

/*
 * Live tier. This suite talks to a real Ollama daemon and runs only when
 * CHRYSALYST_LIVE_LLM holds a non-empty value; an unset variable and an empty
 * string both leave it disabled, so a CI `env:` block that writes '' does not
 * accidentally enable it. Every SDK call sits inside the test body, so merely
 * collecting this file contacts nothing.
 */

function ask(content: string): LlmRequest {
  return { messages: [{ role: 'user', content }] };
}

describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')(
  'A running Ollama answers through the port',
  { timeout: 120000 },
  () => {
    it('answers status, complete, stream and a mid-stream abort against a real daemon', async () => {
      const config = llmConfigFromEnv();
      const llm = createOpenAiCompatibleLlm(config);

      const status = await llm.status();
      expect(status.available).toBe(true);
      expect(status.models).toContain(config.defaultModel);

      const answer = await llm.complete(ask('Reply with a short greeting.'));
      expect(typeof answer).toBe('string');
      expect(answer.trim().length).toBeGreaterThan(0);

      const chunks: string[] = [];
      for await (const chunk of llm.stream(
        ask('Name three primary colours.'),
      )) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('').length).toBeGreaterThan(0);

      const aborter = new AbortController();
      const received: string[] = [];
      let rejected = false;
      try {
        for await (const chunk of llm.stream(
          ask('Write several long paragraphs about the ocean.'),
          aborter.signal,
        )) {
          received.push(chunk);
          if (received.length === 1) {
            aborter.abort();
          }
        }
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(false);
      expect(received.length).toBeGreaterThan(0);
    });
  },
);
