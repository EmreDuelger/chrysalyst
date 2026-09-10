import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { llmConfigFromEnv } from '../adapters/llm/openai-compatible-llm.ts';
import { createApp } from '../app.ts';
import { createDependenciesFromEnv } from '../composition.ts';
import { startServer, type ServerHandle } from '../server.ts';

/*
 * Live tier. This suite drives the real HTTP routes over a real Ollama daemon
 * and runs only when CHRYSALYST_LIVE_LLM holds a non-empty value; an unset
 * variable and an empty string both leave it disabled, so a CI `env:` block
 * that writes '' does not accidentally enable it. Every backend call sits inside
 * the test body — collecting this file starts no server and contacts nothing.
 *
 * The milestone's claim is about the whole path, so the assertions run against
 * the bound server exactly where a browser would see it: the SSE framing, the
 * openai-compatible adapter, the filesystem store, and the model together. The
 * measured time from dispatching the question request to the first `token`
 * event is the feasibility figure the verification report carries.
 */

const FIRST_TOKEN_CEILING_MS = 30_000;

interface SseEvent {
  readonly event: string;
  readonly data: unknown;
}

function decodeFrame(frame: string): SseEvent {
  const lines = frame.split('\n');
  const eventLine = lines.find((line) => line.startsWith('event: '));
  const dataLine = lines.find((line) => line.startsWith('data: '));
  if (eventLine === undefined || dataLine === undefined) {
    throw new Error(`not an SSE frame: ${JSON.stringify(frame)}`);
  }
  return {
    event: eventLine.slice('event: '.length),
    data: JSON.parse(dataLine.slice('data: '.length)) as unknown,
  };
}

async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const step = await reader.read();
    if (step.value !== undefined) {
      buffer += decoder.decode(step.value, { stream: true });
    }
    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      if (frame.trim() !== '') {
        yield decodeFrame(frame);
      }
      separator = buffer.indexOf('\n\n');
    }
    if (step.done) {
      return;
    }
  }
}

function carriesThinkMarker(text: string): boolean {
  return text.toLowerCase().includes('<think>');
}

function boundPort(handle: ServerHandle): number {
  const address = handle.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`expected a bound TCP address, got ${String(address)}`);
  }
  return address.port;
}

let running: ServerHandle | undefined;
let sandbox: string | undefined;

afterEach(async () => {
  if (running !== undefined) {
    await running.close();
    running = undefined;
  }
  if (sandbox !== undefined) {
    await rm(sandbox, { recursive: true, force: true });
    sandbox = undefined;
  }
});

describe.skipIf((process.env.CHRYSALYST_LIVE_LLM ?? '') === '')(
  'A running Ollama drives one round of the interview through the real routes',
  { timeout: 120_000 },
  () => {
    it('streams a reasoning-free question, times the first token, and persists the round', async () => {
      const model = llmConfigFromEnv(process.env).defaultModel;
      sandbox = await mkdtemp(join(tmpdir(), 'chrysalyst-interview-live-'));
      const dependencies = createDependenciesFromEnv({
        ...process.env,
        CHRYSALYST_SESSION_DIR: sandbox,
      });
      running = await startServer(createApp(dependencies), 0);
      const base = `http://127.0.0.1:${String(boundPort(running))}`;

      const created = await fetch(`${base}/interview`, { method: 'POST' });
      expect(created.status).toBe(201);
      const { id } = (await created.json()) as { id: string };
      expect(typeof id).toBe('string');

      const dispatchedAt = performance.now();
      const questionResponse = await fetch(`${base}/interview/${id}/question`);
      expect(questionResponse.status).toBe(200);
      if (questionResponse.body === null) {
        throw new Error('the question route returned no response body');
      }

      let msToFirstToken: number | undefined;
      let firstTokenText: string | undefined;
      const spoken: string[] = [];
      let announced: string | undefined;
      for await (const frame of readSseEvents(questionResponse.body)) {
        if (frame.event === 'token') {
          const { text } = frame.data as { text: string };
          if (msToFirstToken === undefined) {
            msToFirstToken = performance.now() - dispatchedAt;
            firstTokenText = text;
          }
          spoken.push(text);
        } else if (frame.event === 'done') {
          announced = (frame.data as { question: string }).question;
        } else if (frame.event === 'error') {
          throw new Error(
            `the model failed the opening question: ${
              (frame.data as { message: string }).message
            }`,
          );
        }
      }

      const question = announced ?? spoken.join('');
      const answer = 'A recipe app that helps home cooks decide what to cook.';

      console.info(
        `[feasibility] model=${model} msToFirstToken=${
          msToFirstToken === undefined ? 'never' : msToFirstToken.toFixed(0)
        }`,
      );

      expect(announced).toBeDefined();
      expect(firstTokenText).toBeDefined();
      expect(msToFirstToken).toBeDefined();
      expect(question.trim().length).toBeGreaterThan(0);
      expect(carriesThinkMarker(question)).toBe(false);
      expect(carriesThinkMarker(firstTokenText ?? '')).toBe(false);
      expect(msToFirstToken ?? Infinity).toBeLessThan(FIRST_TOKEN_CEILING_MS);

      const answered = await fetch(`${base}/interview/${id}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
      expect(answered.status).toBe(204);

      const envelope = JSON.parse(
        await readFile(join(sandbox, id, 'session.json'), 'utf8'),
      ) as {
        schemaVersion: number;
        state: {
          turns: {
            status: string;
            question: string;
            answer: string;
            askedAt: string;
            answeredAt: string;
          }[];
        };
      };
      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.state.turns).toHaveLength(1);
      const [turn] = envelope.state.turns;
      expect(turn.status).toBe('answered');
      expect(turn.question).toBe(question);
      expect(turn.answer).toBe(answer);
      expect(typeof turn.askedAt).toBe('string');
      expect(typeof turn.answeredAt).toBe('string');

      const transcript = await readFile(
        join(sandbox, id, 'transcript.md'),
        'utf8',
      );
      expect(transcript).toContain(question);
      expect(transcript).toContain(answer);
    });
  },
);
