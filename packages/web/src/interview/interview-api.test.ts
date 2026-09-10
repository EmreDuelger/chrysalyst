import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  createSession,
  openQuestionStream,
  submitAnswer,
  type QuestionEvent,
} from './interview-api.ts';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const fixtureText = readFileSync(
  join(repoRoot, 'tests', 'fixtures', 'interview-sse-frames.txt'),
  'utf8',
);

function framePayloads(text: string): Record<string, unknown>[] {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map((block) => {
      const dataLine = block
        .split('\n')
        .find((line) => line.startsWith('data: '));
      if (dataLine === undefined) {
        throw new Error(`fixture frame carries no data line: ${block}`);
      }
      return JSON.parse(dataLine.slice('data: '.length)) as Record<
        string,
        unknown
      >;
    });
}

function stringField(
  payload: Record<string, unknown> | undefined,
  field: string,
): string {
  const value = payload?.[field];
  if (typeof value !== 'string') {
    throw new Error(`fixture frame is missing string field "${field}"`);
  }
  return value;
}

const fixturePayloads = framePayloads(fixtureText);

/** The wire payloads the fixture's two `token` frames carry, in order. */
const FIXTURE_TOKENS = [
  stringField(fixturePayloads[0], 'text'),
  stringField(fixturePayloads[1], 'text'),
];
const FIXTURE_QUESTION = stringField(fixturePayloads[2], 'question');
const FIXTURE_ERROR = stringField(fixturePayloads[3], 'message');

function streamingResponse(
  chunks: readonly string[],
  init?: ResponseInit,
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, init);
}

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

async function collect(
  events: AsyncIterable<QuestionEvent>,
): Promise<QuestionEvent[]> {
  const collected: QuestionEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

describe('interview API client', () => {
  describe('createSession', () => {
    it('posts to the interview route and returns the minted identifier', async () => {
      const { impl, calls } = recordingFetch(
        () =>
          new Response(JSON.stringify({ id: 'session-42' }), { status: 201 }),
      );

      const id = await createSession(impl);

      expect(id).toBe('session-42');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('/interview');
      expect(calls[0]?.init?.method).toBe('POST');
    });

    it('rejects when the server does not answer 201', async () => {
      const { impl } = recordingFetch(
        () => new Response('nope', { status: 500 }),
      );

      await expect(createSession(impl)).rejects.toThrow(/500/);
    });
  });

  describe('openQuestionStream', () => {
    it('requests the question route for the given session', async () => {
      const { impl, calls } = recordingFetch(() =>
        streamingResponse([fixtureText]),
      );

      await collect(openQuestionStream('abc', impl));

      expect(calls[0]?.url).toBe('/interview/abc/question');
      expect(calls[0]?.init?.method ?? 'GET').toBe('GET');
    });

    it('decodes the fixture frames into typed events', async () => {
      const { impl } = recordingFetch(() => streamingResponse([fixtureText]));

      const events = await collect(openQuestionStream('abc', impl));

      expect(events).toEqual([
        { event: 'token', text: FIXTURE_TOKENS[0] },
        { event: 'token', text: FIXTURE_TOKENS[1] },
        { event: 'done', question: FIXTURE_QUESTION },
        { event: 'error', message: FIXTURE_ERROR },
      ]);
    });

    it('reassembles events across a chunk boundary the caller controls', async () => {
      const cut = Math.floor(fixtureText.length / 3);
      const { impl } = recordingFetch(() =>
        streamingResponse([
          fixtureText.slice(0, cut),
          fixtureText.slice(cut, cut + 5),
          fixtureText.slice(cut + 5),
        ]),
      );

      const events = await collect(openQuestionStream('abc', impl));

      expect(events.map((event) => event.event)).toEqual([
        'token',
        'token',
        'done',
        'error',
      ]);
      const done = events.find((event) => event.event === 'done');
      expect(done?.event === 'done' ? done.question : '').toBe(
        FIXTURE_QUESTION,
      );
    });

    it('rejects a frame carrying an unknown event name', async () => {
      const { impl } = recordingFetch(() =>
        streamingResponse(['event: surprise\ndata: {"text":"x"}\n\n']),
      );

      await expect(collect(openQuestionStream('abc', impl))).rejects.toThrow(
        /unknown event/i,
      );
    });

    it('rejects a frame whose data payload is not valid JSON', async () => {
      const { impl } = recordingFetch(() =>
        streamingResponse(['event: token\ndata: {not json}\n\n']),
      );

      await expect(collect(openQuestionStream('abc', impl))).rejects.toThrow(
        /malformed/i,
      );
    });

    it('rejects a frame whose payload lacks the expected string field', async () => {
      const { impl } = recordingFetch(() =>
        streamingResponse(['event: token\ndata: {"text":42}\n\n']),
      );

      await expect(collect(openQuestionStream('abc', impl))).rejects.toThrow(
        /token event/i,
      );
    });

    it('passes the abort signal through to fetch', async () => {
      const controller = new AbortController();
      const { impl, calls } = recordingFetch(() =>
        streamingResponse([fixtureText]),
      );

      await collect(openQuestionStream('abc', impl, controller.signal));

      expect(calls[0]?.init?.signal).toBe(controller.signal);
    });

    it('ends quietly when its signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const impl = vi.fn(() =>
        Promise.reject(new DOMException('aborted', 'AbortError')),
      ) as unknown as typeof fetch;

      await expect(
        collect(openQuestionStream('abc', impl, controller.signal)),
      ).resolves.toEqual([]);
    });
  });

  describe('submitAnswer', () => {
    it('posts the answer for the session and reports acceptance on 204', async () => {
      const { impl, calls } = recordingFetch(
        () => new Response(null, { status: 204 }),
      );

      const result = await submitAnswer('abc', 'A recipe app.', impl);

      expect(result).toEqual({ outcome: 'recorded' });
      expect(calls[0]?.url).toBe('/interview/abc/answer');
      expect(calls[0]?.init?.method).toBe('POST');
      expect(calls[0]?.init?.body).toBe(
        JSON.stringify({ answer: 'A recipe app.' }),
      );
    });

    it('reports the server message when the answer is refused', async () => {
      const { impl } = recordingFetch(
        () =>
          new Response(
            JSON.stringify({ message: 'question already answered' }),
            {
              status: 409,
            },
          ),
      );

      const result = await submitAnswer('abc', 'late', impl);

      expect(result).toEqual({
        outcome: 'refused',
        message: 'question already answered',
      });
    });
  });
});
