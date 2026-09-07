import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { LlmPort, LlmRequest } from '@chrysalyst/core';
import { describe, expect, it } from 'vitest';

import {
  createOpenAiCompatibleLlm,
  llmConfigFromEnv,
} from './openai-compatible-llm.ts';

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1';
const LM_STUDIO_BASE_URL = 'http://127.0.0.1:1234/v1';
const DEFAULT_MODEL = 'llama3.2:3b';
const EVENT_STREAM = {
  status: 200,
  headers: { 'content-type': 'text/event-stream' },
} as const;

const GREETING: LlmRequest = {
  messages: [{ role: 'user', content: 'Greet me.' }],
};

/*
 * The four response fixtures. The streamed frames are a verified recording of
 * the SSE shape `@ai-sdk/openai-compatible@2.0.74` accepts, not an invented one.
 */

function chatCompletion(content: string): Response {
  return Response.json({
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1,
    model: DEFAULT_MODEL,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

const WELCOME_FRAMES: readonly string[] = [
  'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"llama3.2:3b","choices":[{"index":0,"delta":{"content":"Wel"},"finish_reason":null}]}\n\n',
  'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"llama3.2:3b","choices":[{"index":0,"delta":{"content":"come"},"finish_reason":null}]}\n\n',
  'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"llama3.2:3b","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
  'data: [DONE]\n\n',
];

function deltaFrame(content: string): string {
  return `data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"llama3.2:3b","choices":[{"index":0,"delta":{"content":${JSON.stringify(content)}},"finish_reason":null}]}\n\n`;
}

const FIVE_DELTAS: readonly string[] = [
  'Wel',
  'come',
  ' to',
  ' chrys',
  'alyst',
];

function streamed(frames: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
        }
        controller.close();
      },
    }),
    EVENT_STREAM,
  );
}

/**
 * Emits `frames` and then breaks the body, the way a daemon killed mid-answer
 * does. The response headers were already accepted, so this failure reaches the
 * adapter through a different channel than a connection that was never made.
 */
function severedStream(frames: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
        }
        controller.error(connectionReset());
      },
    }),
    EVENT_STREAM,
  );
}

/**
 * Emits `delivered` frames and then holds the connection open until the caller
 * aborts, so a mid-stream cancellation is decided by the test rather than by
 * how far the SDK happened to read ahead. `teardown` is how the transport
 * reports the connection once the abort lands — an `AbortError` from a
 * well-behaved `fetch`, or a reset from a socket torn down under it.
 */
function parkedStream(
  frames: readonly string[],
  delivered: number,
  signal: AbortSignal,
  teardown: Error = new DOMException(
    'This operation was aborted',
    'AbortError',
  ),
): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (index < delivered) {
          controller.enqueue(encoder.encode(frames[index]));
          index += 1;
          return;
        }
        await abortion(signal);
        controller.error(teardown);
      },
    }),
    EVENT_STREAM,
  );
}

function abortion(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

function modelList(ids: readonly string[]): Response {
  return Response.json({
    object: 'list',
    data: ids.map((id) => ({ id, object: 'model', created: 1 })),
  });
}

function connectionRefused(): never {
  const refusal = Object.assign(
    new Error('connect ECONNREFUSED 127.0.0.1:11434'),
    { code: 'ECONNREFUSED' },
  );
  throw new TypeError('fetch failed', { cause: refusal });
}

function connectionReset(): Error {
  return Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
}

/*
 * The stub transport. It records every request the adapter issues and honours
 * an aborted signal the way `fetch` does, so no scenario opens a socket.
 */

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly authorization: string | null;
  readonly body: string | null;
}

type RouteAnswer = (signal: AbortSignal) => Response | Promise<Response>;

interface TransportRoutes {
  readonly chatCompletions?: RouteAnswer;
  readonly models?: RouteAnswer;
}

interface StubbedAdapter {
  readonly llm: LlmPort;
  readonly recorded: readonly RecordedRequest[];
}

function answerFor(
  routes: TransportRoutes,
  pathname: string,
): RouteAnswer | undefined {
  if (pathname.endsWith('/chat/completions')) {
    return routes.chatCompletions;
  }
  if (pathname.endsWith('/models')) {
    return routes.models;
  }
  return undefined;
}

function adapterOver(
  routes: TransportRoutes,
  baseUrl: string = OLLAMA_BASE_URL,
): StubbedAdapter {
  const recorded: RecordedRequest[] = [];
  const transport: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.signal.aborted) {
      throw new DOMException('This operation was aborted', 'AbortError');
    }
    recorded.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get('authorization'),
      body: request.body === null ? null : await request.text(),
    });
    const answer = answerFor(routes, new URL(request.url).pathname);
    if (answer === undefined) {
      throw new Error(`no stubbed route for ${request.method} ${request.url}`);
    }
    return answer(request.signal);
  };
  return {
    llm: createOpenAiCompatibleLlm({
      baseUrl,
      defaultModel: DEFAULT_MODEL,
      fetch: transport,
    }),
    recorded,
  };
}

function requestedModel(request: RecordedRequest): unknown {
  const body = JSON.parse(request.body ?? 'null') as {
    readonly model?: unknown;
  };
  return body.model;
}

async function drain(chunks: AsyncIterable<string>): Promise<string[]> {
  const collected: string[] = [];
  for await (const chunk of chunks) {
    collected.push(chunk);
  }
  return collected;
}

async function rejectionOf(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject, but it resolved');
}

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current instanceof Error && current.cause !== undefined) {
    chain.push(current.cause);
    current = current.cause;
  }
  return chain;
}

function carriesErrno(code: string): (value: unknown) => boolean {
  return (value) =>
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === code;
}

const isRefusal = carriesErrno('ECONNREFUSED');
const isReset = carriesErrno('ECONNRESET');

describe('createOpenAiCompatibleLlm', () => {
  it('completes a request against the chat completions endpoint', async () => {
    const { llm, recorded } = adapterOver({
      chatCompletions: () => chatCompletion('Welcome'),
    });

    await expect(llm.complete(GREETING)).resolves.toBe('Welcome');

    expect(recorded).toHaveLength(1);
    expect(recorded[0].url).toBe(`${OLLAMA_BASE_URL}/chat/completions`);
    expect(requestedModel(recorded[0])).toBe(DEFAULT_MODEL);

    await llm.complete({ ...GREETING, model: 'qwen2.5:7b' });

    expect(recorded).toHaveLength(2);
    expect(requestedModel(recorded[1])).toBe('qwen2.5:7b');
  });

  it('yields streamed deltas in order', async () => {
    const { llm } = adapterOver({
      chatCompletions: () => streamed(WELCOME_FRAMES),
    });

    const chunks = await drain(llm.stream(GREETING));

    expect(chunks).toEqual(['Wel', 'come']);
    expect(chunks.join('')).toBe('Welcome');
    expect(chunks.some((chunk) => chunk.includes('data:'))).toBe(false);
  });

  it('ends the stream on abort without rejecting', async () => {
    const controller = new AbortController();
    const { llm } = adapterOver({
      chatCompletions: (signal) =>
        parkedStream(FIVE_DELTAS.map(deltaFrame), 2, signal),
    });

    const chunks: string[] = [];
    for await (const chunk of llm.stream(GREETING, controller.signal)) {
      chunks.push(chunk);
      if (chunks.length === 2) {
        controller.abort();
      }
    }

    expect(chunks).toEqual(['Wel', 'come']);

    const preAborted = adapterOver({
      chatCompletions: () => streamed(WELCOME_FRAMES),
    });

    await expect(
      drain(preAborted.llm.stream(GREETING, AbortSignal.abort())),
    ).resolves.toEqual([]);
  });

  it('rejects a completion with AbortError once the signal aborts', async () => {
    const { llm } = adapterOver({
      chatCompletions: () => chatCompletion('Welcome'),
    });

    const failure = await rejectionOf(
      llm.complete(GREETING, AbortSignal.abort()),
    );

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('name', 'AbortError');
  });

  it('reports an available backend and lists its models in order', async () => {
    const stocked = adapterOver({
      models: () => modelList(['llama3.2:3b', 'qwen2.5:7b']),
    });

    await expect(stocked.llm.status()).resolves.toEqual({
      available: true,
      models: ['llama3.2:3b', 'qwen2.5:7b'],
    });
    expect(stocked.recorded[0].url).toBe(`${OLLAMA_BASE_URL}/models`);

    const bare = adapterOver({ models: () => modelList([]) });

    await expect(bare.llm.status()).resolves.toEqual({
      available: true,
      models: [],
    });
  });

  it('resolves unavailable for a refused connection and for an unreadable 200 body, and rejects a cancelled probe', async () => {
    const unavailable = { available: false, models: [] };

    const refused = adapterOver({ models: connectionRefused });
    await expect(refused.llm.status()).resolves.toEqual(unavailable);

    const withoutData = adapterOver({
      models: () => Response.json({ models: [{ name: 'llama3.2:3b' }] }),
    });
    await expect(withoutData.llm.status()).resolves.toEqual(unavailable);

    const withoutIds = adapterOver({
      models: () =>
        Response.json({ object: 'list', data: [{ name: 'llama3.2:3b' }] }),
    });
    await expect(withoutIds.llm.status()).resolves.toEqual(unavailable);

    const failing = adapterOver({
      models: () => new Response('service unavailable', { status: 503 }),
    });
    await expect(failing.llm.status()).resolves.toEqual(unavailable);

    const unparseable = adapterOver({
      models: () => new Response('service unavailable', { status: 200 }),
    });
    await expect(unparseable.llm.status()).resolves.toEqual(unavailable);

    const cancelled = adapterOver({ models: () => modelList([]) });
    const failure = await rejectionOf(
      cancelled.llm.status(AbortSignal.abort()),
    );

    expect(failure).toBeInstanceOf(Error);
  });

  it('rejects complete and stream naming the base URL with the transport error as cause', async () => {
    const { llm } = adapterOver({ chatCompletions: connectionRefused });

    const completion = await rejectionOf(llm.complete(GREETING));

    expect(completion).toBeInstanceOf(Error);
    expect(completion).toHaveProperty(
      'message',
      expect.stringContaining(OLLAMA_BASE_URL),
    );
    expect(causeChain(completion).some(isRefusal)).toBe(true);

    const streaming = await rejectionOf(drain(llm.stream(GREETING)));

    expect(streaming).toBeInstanceOf(Error);
    expect(streaming).toHaveProperty(
      'message',
      expect.stringContaining(OLLAMA_BASE_URL),
    );
    expect(causeChain(streaming).some(isRefusal)).toBe(true);
  });

  it('rejects a stream whose connection drops after the answer began, naming the base URL', async () => {
    const { llm } = adapterOver({
      chatCompletions: () => severedStream([deltaFrame('Wel')]),
    });

    const failure = await rejectionOf(drain(llm.stream(GREETING)));

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty(
      'message',
      expect.stringContaining(OLLAMA_BASE_URL),
    );
    expect(causeChain(failure).some(isReset)).toBe(true);
  });

  it('ends a stream quietly when the dropped connection follows the caller aborting', async () => {
    const controller = new AbortController();
    const { llm } = adapterOver({
      chatCompletions: (signal) =>
        parkedStream(FIVE_DELTAS.map(deltaFrame), 1, signal, connectionReset()),
    });

    const chunks: string[] = [];
    for await (const chunk of llm.stream(GREETING, controller.signal)) {
      chunks.push(chunk);
      if (chunks.length === 1) {
        controller.abort();
      }
    }

    expect(chunks).toEqual(['Wel']);
  });

  it('issues only OpenAI-compatible paths against the configured base URL with no Authorization header', async () => {
    const { llm, recorded } = adapterOver(
      {
        chatCompletions: () => chatCompletion('Welcome'),
        models: () => modelList(['llama3.2:3b']),
      },
      LM_STUDIO_BASE_URL,
    );

    await llm.complete(GREETING);
    await llm.status();

    expect(recorded).toHaveLength(2);
    expect(
      recorded.every((request) => request.url.startsWith(LM_STUDIO_BASE_URL)),
    ).toBe(true);
    expect(recorded.map((request) => new URL(request.url).pathname)).toEqual([
      '/v1/chat/completions',
      '/v1/models',
    ]);
    expect(recorded.every((request) => request.authorization === null)).toBe(
      true,
    );
  });
});

describe('llmConfigFromEnv', () => {
  it('defaults to Ollama on loopback and lets each variable override', () => {
    expect(llmConfigFromEnv({})).toEqual({
      baseUrl: OLLAMA_BASE_URL,
      defaultModel: DEFAULT_MODEL,
    });

    expect(
      llmConfigFromEnv({ CHRYSALYST_LLM_BASE_URL: LM_STUDIO_BASE_URL }),
    ).toEqual({
      baseUrl: LM_STUDIO_BASE_URL,
      defaultModel: DEFAULT_MODEL,
    });

    expect(llmConfigFromEnv({ CHRYSALYST_LLM_MODEL: 'qwen2.5:7b' })).toEqual({
      baseUrl: OLLAMA_BASE_URL,
      defaultModel: 'qwen2.5:7b',
    });

    expect(
      llmConfigFromEnv({
        CHRYSALYST_LLM_BASE_URL: '',
        CHRYSALYST_LLM_MODEL: '',
      }),
    ).toEqual({
      baseUrl: OLLAMA_BASE_URL,
      defaultModel: DEFAULT_MODEL,
    });

    const source = readFileSync(
      fileURLToPath(new URL('./openai-compatible-llm.ts', import.meta.url)),
      'utf8',
    );
    const imported = [...source.matchAll(/^import .* from '(.+)';$/gm)].map(
      (match) => match[1],
    );

    expect(imported).not.toHaveLength(0);
    expect(
      imported.some(
        (specifier) =>
          specifier.startsWith('node:fs') || specifier.includes('dotenv'),
      ),
    ).toBe(false);
  });
});
