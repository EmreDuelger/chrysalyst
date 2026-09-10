import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ClockPort,
  InterviewState,
  LlmPort,
  LlmRequest,
  SessionStorePort,
} from '@chrysalyst/core';
import { renderTranscript } from '@chrysalyst/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFilesystemSessionStore } from '../adapters/session-store/filesystem-session-store.ts';
import { createApp } from '../app.ts';

/*
 * The wire contract lives in one file outside every package. This suite asserts
 * the question route emits exactly those bytes, so a rename of an event name or
 * a payload field fails this run rather than only a browser.
 */
const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const fixtureFrames = splitFrames(
  readFileSync(
    join(repoRoot, 'tests', 'fixtures', 'interview-sse-frames.txt'),
    'utf8',
  ),
);
const [firstTokenFrame, secondTokenFrame, doneFrame, errorFrame] =
  fixtureFrames;
const happyPathBody =
  [firstTokenFrame, secondTokenFrame, doneFrame].join('\n\n') + '\n\n';
const modelChunks = [firstTokenFrame, secondTokenFrame].map(
  (frame) => (decodeFrame(frame).data as { text: string }).text,
);
const fullQuestion = (decodeFrame(doneFrame).data as { question: string })
  .question;
const unreachableMessage = (decodeFrame(errorFrame).data as { message: string })
  .message;

const JSON_HEADERS = { 'content-type': 'application/json' };

function splitFrames(body: string): string[] {
  return body.split('\n\n').filter((frame) => frame !== '');
}

function decodeFrame(frame: string): { event: string; data: unknown } {
  const lines = frame.split('\n');
  const eventLine = lines.find((line) => line.startsWith('event: '));
  const dataLine = lines.find((line) => line.startsWith('data: '));
  if (eventLine === undefined || dataLine === undefined) {
    throw new Error(`not an SSE frame: ${JSON.stringify(frame)}`);
  }
  return {
    event: eventLine.slice('event: '.length),
    data: JSON.parse(dataLine.slice('data: '.length)),
  };
}

interface FakeLlm extends LlmPort {
  readonly requests: LlmRequest[];
  observedCancellation: boolean;
}

/**
 * Reads the signal through a call, because a check written after an `await`
 * would otherwise be narrowed away by the loop condition that preceded it and
 * rejected as a comparison with no overlap.
 */
function cancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** A model double that yields a scripted chunk list and ends. */
function chunkedLlm(chunks: readonly string[]): FakeLlm {
  const requests: LlmRequest[] = [];
  const fake: FakeLlm = {
    requests,
    observedCancellation: false,
    status: () => Promise.resolve({ available: true, models: [] }),
    complete: () =>
      Promise.reject(new Error('the interview never calls complete')),
    async *stream(request: LlmRequest, signal?: AbortSignal) {
      requests.push(request);
      for (const chunk of chunks) {
        if (cancelled(signal)) {
          fake.observedCancellation = true;
          return;
        }
        yield chunk;
      }
    },
  };
  return fake;
}

/** A model double whose stream rejects the moment it is iterated. */
function rejectingLlm(message: string): FakeLlm {
  const requests: LlmRequest[] = [];
  const error = new Error(message);
  return {
    requests,
    observedCancellation: false,
    status: () => Promise.resolve({ available: true, models: [] }),
    complete: () =>
      Promise.reject(new Error('the interview never calls complete')),
    stream: (request: LlmRequest) => {
      requests.push(request);
      return {
        [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
      };
    },
  };
}

/**
 * A model double that keeps yielding at a slow pace and checks its signal
 * between chunks, so a route test can abandon a live stream and observe the
 * cancellation reach the model. The pace is a bare event-loop yield, not a
 * wall-clock sleep, so it holds the stream open exactly until every pending
 * microtask has drained.
 */
function endlessLlm(): FakeLlm {
  const requests: LlmRequest[] = [];
  const fake: FakeLlm = {
    requests,
    observedCancellation: false,
    status: () => Promise.resolve({ available: true, models: [] }),
    complete: () =>
      Promise.reject(new Error('the interview never calls complete')),
    async *stream(request: LlmRequest, signal?: AbortSignal) {
      requests.push(request);
      let index = 0;
      while (!cancelled(signal)) {
        await new Promise((tick) => {
          setImmediate(tick);
        });
        if (cancelled(signal)) {
          break;
        }
        yield `part ${String(index++)} `;
      }
      fake.observedCancellation = true;
    },
  };
  return fake;
}

function scriptedClock(): ClockPort {
  const base = Date.parse('2026-09-09T12:00:00.000Z');
  let tick = 0;
  return { now: () => new Date(base + tick++ * 60_000) };
}

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), 'chrysalyst-interview-routes-'));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly llm: FakeLlm;
  readonly sessions: SessionStorePort<InterviewState>;
}

function buildApp(
  llm: FakeLlm,
  sessions: SessionStorePort<InterviewState> = createFilesystemSessionStore<InterviewState>(
    { rootDir, renderTranscript },
  ),
): Harness {
  const app = createApp({ llm, sessions, clock: scriptedClock() });
  return { app, llm, sessions };
}

async function createSession(app: Harness['app']): Promise<string> {
  const response = await app.request('/interview', { method: 'POST' });
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function streamQuestionToEnd(
  app: Harness['app'],
  id: string,
): Promise<Response> {
  const response = await app.request(`/interview/${id}/question`);
  await response.text();
  return response;
}

function readEnvelope(id: string): Promise<string> {
  return readFile(join(rootDir, id, 'session.json'), 'utf8');
}

describe('POST /interview', () => {
  it('answers 201 with an id and lands the session on disk without reaching the model', async () => {
    const { app, llm, sessions } = buildApp(chunkedLlm(modelChunks));

    const response = await app.request('/interview', { method: 'POST' });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: unknown };
    expect(typeof body.id).toBe('string');
    await expect(sessions.load(body.id as string)).resolves.toMatchObject({
      state: { turns: [] },
    });
    expect(llm.requests).toHaveLength(0);
  });
});

describe('GET /interview/:id/question', () => {
  it('emits the fixture first three frames byte for byte and stores the question before done', async () => {
    const { app, sessions } = buildApp(chunkedLlm(modelChunks));
    const id = await createSession(app);

    const response = await app.request(`/interview/${id}/question`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(await response.text()).toBe(happyPathBody);

    const stored = await sessions.load(id);
    expect(stored?.state.turns).toEqual([
      { status: 'asked', question: fullQuestion, askedAt: expect.any(String) },
    ]);
    expect(fullQuestion).toBe(modelChunks.join(''));
  });

  it('escapes a newline inside the payload and emits one separator per event', async () => {
    const { app } = buildApp(chunkedLlm(modelChunks));
    const id = await createSession(app);

    const body = await (await app.request(`/interview/${id}/question`)).text();

    expect(body).toContain('solve,\\n');
    expect(body).not.toContain('solve,\nand what');
    const events = splitFrames(body).map((frame) => decodeFrame(frame).event);
    expect(events).toEqual(['token', 'token', 'done']);
    expect(body.split('\n\n').length - 1).toBe(events.length);
  });

  it('frames a replayed question identically and reaches no model on the second request', async () => {
    const { app, llm } = buildApp(chunkedLlm(modelChunks));
    const id = await createSession(app);

    await streamQuestionToEnd(app, id);
    const firstEnvelope = JSON.parse(await readEnvelope(id)) as {
      state: { turns: { askedAt: string }[] };
    };

    const replayBody = await (
      await app.request(`/interview/${id}/question`)
    ).text();

    const frames = splitFrames(replayBody);
    const decoded = frames.map(decodeFrame);
    expect(decoded.at(-1)).toEqual({
      event: 'done',
      data: { question: fullQuestion },
    });
    expect(
      decoded
        .filter((frame) => frame.event === 'token')
        .map((frame) => (frame.data as { text: string }).text)
        .join(''),
    ).toBe(fullQuestion);
    expect(decoded.some((frame) => frame.event === 'error')).toBe(false);
    expect(llm.requests).toHaveLength(1);

    const secondEnvelope = JSON.parse(await readEnvelope(id)) as {
      state: { turns: { askedAt: string }[] };
    };
    expect(secondEnvelope.state.turns[0].askedAt).toBe(
      firstEnvelope.state.turns[0].askedAt,
    );
  });

  it('answers 200 then writes the fixture error frame, no done frame, and stores no turn', async () => {
    const { app, sessions } = buildApp(rejectingLlm(unreachableMessage));
    const id = await createSession(app);

    const response = await app.request(`/interview/${id}/question`);
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(splitFrames(body).at(-1)).toBe(errorFrame);
    expect(body).not.toContain('event: done');
    expect((await sessions.load(id))?.state.turns).toEqual([]);
  });

  it('keeps every token frame, writes an error frame naming the store, and omits done', async () => {
    const disk = createFilesystemSessionStore<InterviewState>({
      rootDir,
      renderTranscript,
    });
    const failingSave: SessionStorePort<InterviewState> = {
      list: () => disk.list(),
      load: (id) => disk.load(id),
      save: (session) =>
        session.state.turns.length > 0
          ? Promise.reject(
              new Error(`the session store at ${rootDir} rejected the save`),
            )
          : disk.save(session),
    };
    const { app } = buildApp(chunkedLlm(modelChunks), failingSave);
    const id = await createSession(app);

    const body = await (await app.request(`/interview/${id}/question`)).text();

    const decoded = splitFrames(body).map(decodeFrame);
    expect(
      decoded.filter((frame) => frame.event === 'token').map((f) => f.data),
    ).toEqual(modelChunks.map((text) => ({ text })));
    const last = decoded.at(-1);
    expect(last?.event).toBe('error');
    expect((last?.data as { message: string }).message).toContain(rootDir);
    expect(decoded.some((frame) => frame.event === 'done')).toBe(false);
    expect((await disk.load(id))?.state.turns).toEqual([]);
  });

  it('answers 404 as JSON naming the id, with no event-stream content type', async () => {
    const { app, llm } = buildApp(chunkedLlm(modelChunks));

    const response = await app.request('/interview/never-created/question');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).not.toMatch(
      /text\/event-stream/,
    );
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('never-created'),
    });
    expect(llm.requests).toHaveLength(0);
  });

  it('cancels the model and stores no turn when the body reader is cancelled', async () => {
    const { app, llm, sessions } = buildApp(endlessLlm());
    const id = await createSession(app);

    const response = await app.request(`/interview/${id}/question`);
    const responseBody: ReadableStream<Uint8Array> | null = response.body;
    if (responseBody === null) {
      throw new Error('the question route returned no response body');
    }
    const reader = responseBody.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (!buffer.includes('\n\n')) {
      const step = await reader.read();
      if (step.value !== undefined) {
        buffer += decoder.decode(step.value, { stream: true });
      }
      if (step.done) {
        break;
      }
    }
    expect(decodeFrame(splitFrames(buffer)[0]).event).toBe('token');

    await reader.cancel();

    await vi.waitFor(() => {
      expect(llm.observedCancellation).toBe(true);
    });
    await vi.waitFor(async () => {
      expect((await sessions.load(id))?.state.turns).toEqual([]);
    });
  });
});

describe('POST /interview/:id/answer', () => {
  it('answers 204 and writes both session.json and a transcript carrying the interview', async () => {
    const { app } = buildApp(chunkedLlm(modelChunks));
    const id = await createSession(app);
    await streamQuestionToEnd(app, id);

    const response = await app.request(`/interview/${id}/answer`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ answer: 'Eine App fuer Rezepte.' }),
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');

    const envelope = JSON.parse(await readEnvelope(id)) as {
      schemaVersion: number;
      state: { turns: Record<string, unknown>[] };
    };
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.state.turns[0]).toMatchObject({
      status: 'answered',
      question: fullQuestion,
      answer: 'Eine App fuer Rezepte.',
      askedAt: expect.any(String),
      answeredAt: expect.any(String),
    });

    const transcript = await readFile(
      join(rootDir, id, 'transcript.md'),
      'utf8',
    );
    expect(transcript).toContain(fullQuestion);
    expect(transcript).toContain('Eine App fuer Rezepte.');
  });

  it('answers 404 as JSON naming the id', async () => {
    const { app } = buildApp(chunkedLlm(modelChunks));

    const response = await app.request('/interview/no-such-session/answer', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ answer: 'irrelevant' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('no-such-session'),
    });
  });

  it('answers 409 and leaves the stored answer unchanged', async () => {
    const { app } = buildApp(chunkedLlm(modelChunks));
    const id = await createSession(app);
    await streamQuestionToEnd(app, id);

    const first = await app.request(`/interview/${id}/answer`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ answer: 'Die erste Antwort.' }),
    });
    expect(first.status).toBe(204);

    const second = await app.request(`/interview/${id}/answer`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ answer: 'Die zweite Antwort.' }),
    });

    expect(second.status).toBe(409);
    const envelope = JSON.parse(await readEnvelope(id)) as {
      state: { turns: { answer: string }[] };
    };
    expect(envelope.state.turns[0].answer).toBe('Die erste Antwort.');
  });

  it('answers 409 over an empty turn list and stores no answer', async () => {
    const { app } = buildApp(chunkedLlm(modelChunks));
    const id = await createSession(app);

    const response = await app.request(`/interview/${id}/answer`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ answer: 'Eine Antwort ohne Frage.' }),
    });

    expect(response.status).toBe(409);
    const envelope = JSON.parse(await readEnvelope(id)) as {
      state: { turns: unknown[] };
    };
    expect(envelope.state.turns).toEqual([]);
  });

  const malformedBodies = [
    { label: 'a body that is not JSON', body: 'not json at all' },
    { label: 'a JSON body with no answer field', body: '{}' },
    {
      label: 'a JSON body whose answer is not a string',
      body: JSON.stringify({ answer: 42 }),
    },
    {
      label: 'a JSON body whose answer is blank',
      body: JSON.stringify({ answer: '   ' }),
    },
  ];

  it.each(malformedBodies)(
    'answers 400 for $label and leaves the turn unanswered',
    async ({ body }) => {
      const { app } = buildApp(chunkedLlm(modelChunks));
      const id = await createSession(app);
      await streamQuestionToEnd(app, id);

      const response = await app.request(`/interview/${id}/answer`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        message: expect.any(String),
      });
      const envelope = JSON.parse(await readEnvelope(id)) as {
        state: { turns: { status: string }[] };
      };
      expect(envelope.state.turns[0].status).toBe('asked');
    },
  );
});
