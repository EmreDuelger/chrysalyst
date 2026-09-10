import { describe, expect, it } from 'vitest';

import { createSingleTurnInterview } from './single-turn-interview.ts';
import type { InterviewState, Turn } from './state.ts';
import type {
  ClockPort,
  LlmPort,
  LlmRequest,
  SessionId,
  SessionStorePort,
  StoredSession,
} from '../ports/index.ts';

const QUESTION = 'What problem does your product solve?';
const CREATED_AT = new Date('2026-02-03T09:00:00.000Z');
const ASKED_AT = new Date('2026-02-03T09:00:05.000Z');
const ANSWERED_AT = new Date('2026-02-03T09:04:00.000Z');

/**
 * Yields to the event loop once, resuming only after every pending microtask
 * has drained to exhaustion.
 *
 * The delay is zero on purpose. The doubles below contain no timer and no I/O,
 * so every interleaving these tests order is reached through microtasks alone;
 * a fixed span would add an assumption about how far the machine gets in that
 * window without making the drain any more certain.
 */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

function requireStream(
  stream: AsyncIterable<string> | undefined,
): AsyncIterable<string> {
  if (stream === undefined) {
    throw new Error('expected an opening-question stream, got undefined');
  }
  return stream;
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
}

async function drain(iterator: AsyncIterator<string>): Promise<string> {
  let text = '';
  let step = await iterator.next();
  while (step.done !== true) {
    text += step.value;
    step = await iterator.next();
  }
  return text;
}

interface LlmDouble {
  readonly port: LlmPort;
  readonly requests: readonly LlmRequest[];
  readonly signals: readonly (AbortSignal | undefined)[];
  release(): void;
}

/**
 * A model that records every request it receives and yields a scripted chunk
 * list. `gateAfter` holds the stream after that many chunks until `release` is
 * called, so a concurrent second request can be interleaved with the first.
 */
function scriptedLlm(
  chunks: readonly string[],
  options: { readonly gateAfter?: number } = {},
): LlmDouble {
  const requests: LlmRequest[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  const { gateAfter } = options;

  const port: LlmPort = {
    status: () => Promise.resolve({ available: true, models: [] }),
    complete: () => Promise.resolve(chunks.join('')),
    async *stream(request, signal) {
      requests.push(request);
      signals.push(signal);
      let yielded = 0;
      for (const chunk of chunks) {
        if (gateAfter !== undefined && yielded === gateAfter) {
          await gate;
        }
        if (signal?.aborted === true) {
          return;
        }
        yield chunk;
        yielded += 1;
      }
    },
  };

  return {
    port,
    requests,
    signals,
    release: () => {
      openGate();
    },
  };
}

/** A model whose stream rejects the moment it is iterated. */
function rejectingLlm(error: Error): LlmDouble {
  const requests: LlmRequest[] = [];
  const port: LlmPort = {
    status: () => Promise.resolve({ available: false, models: [] }),
    complete: () => Promise.reject(error),
    stream: (request) => {
      requests.push(request);
      return {
        [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
      };
    },
  };
  return { port, requests, signals: [], release: () => undefined };
}

interface StoreDouble {
  readonly port: SessionStorePort<InterviewState>;
  readonly saves: readonly StoredSession<InterviewState>[];
  seed(session: StoredSession<InterviewState>): void;
  current(id: SessionId): StoredSession<InterviewState> | undefined;
}

function memoryStore(): StoreDouble {
  const sessions = new Map<SessionId, StoredSession<InterviewState>>();
  const saves: StoredSession<InterviewState>[] = [];
  const port: SessionStorePort<InterviewState> = {
    list: () => Promise.resolve([...sessions.keys()]),
    load: (id) => {
      const session = sessions.get(id);
      return Promise.resolve(
        session === undefined ? undefined : structuredClone(session),
      );
    },
    save: (session) => {
      const snapshot = structuredClone(session);
      saves.push(snapshot);
      sessions.set(session.id, snapshot);
      return Promise.resolve();
    },
  };
  return {
    port,
    saves,
    seed: (session) => {
      sessions.set(session.id, structuredClone(session));
    },
    current: (id) => {
      const session = sessions.get(id);
      return session === undefined ? undefined : structuredClone(session);
    },
  };
}

function fixedClock(instants: readonly Date[]): ClockPort {
  let index = 0;
  return {
    now: () => {
      const instant = instants[Math.min(index, instants.length - 1)];
      index += 1;
      return new Date(instant);
    },
  };
}

function seededSession(
  id: SessionId,
  turns: readonly Turn[],
  timestamps: { readonly createdAt?: Date; readonly updatedAt?: Date } = {},
): StoredSession<InterviewState> {
  return {
    id,
    createdAt: timestamps.createdAt ?? CREATED_AT,
    updatedAt: timestamps.updatedAt ?? CREATED_AT,
    state: { turns },
  };
}

function askedTurn(question: string = QUESTION): Turn {
  return {
    status: 'asked',
    question,
    askedAt: ASKED_AT.toISOString(),
  };
}

function answeredTurn(): Turn {
  return {
    status: 'answered',
    question: QUESTION,
    askedAt: ASKED_AT.toISOString(),
    answer: 'The first answer.',
    answeredAt: ANSWERED_AT.toISOString(),
  };
}

describe('createSingleTurnInterview', () => {
  describe('begin', () => {
    it('stores an empty turn list under the given id and reaches no model', async () => {
      const model = scriptedLlm([QUESTION]);
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT]),
      });

      await interview.begin('s1');

      const stored = store.current('s1');
      expect(stored).toBeDefined();
      expect(stored?.state.turns).toEqual([]);
      expect(stored?.createdAt.getTime()).toBe(CREATED_AT.getTime());
      expect(stored?.updatedAt.getTime()).toBe(CREATED_AT.getTime());
      expect(model.requests).toHaveLength(0);
    });

    it('leaves a stored session untouched rather than resetting its turns', async () => {
      const model = scriptedLlm([QUESTION]);
      const store = memoryStore();
      const existing = answeredTurn();
      store.seed(seededSession('s1', [existing], { createdAt: CREATED_AT }));
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([new Date('2026-02-04T00:00:00.000Z')]),
      });

      await interview.begin('s1');

      const stored = store.current('s1');
      expect(stored?.state.turns).toEqual([existing]);
      expect(stored?.createdAt.getTime()).toBe(CREATED_AT.getTime());
      expect(model.requests).toHaveLength(0);
    });
  });

  describe('openingQuestion', () => {
    it('yields the model’s chunks in order and saves the asked turn only after the last one', async () => {
      const model = scriptedLlm([
        'What problem ',
        'does your ',
        'product solve?',
      ]);
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT]),
      });
      await interview.begin('s1');

      const received: string[] = [];
      for await (const chunk of requireStream(
        await interview.openingQuestion('s1'),
      )) {
        received.push(chunk);
        expect(store.current('s1')?.state.turns).toEqual([]);
      }

      expect(received).toEqual([
        'What problem ',
        'does your ',
        'product solve?',
      ]);
      const turns = store.current('s1')?.state.turns ?? [];
      expect(turns).toHaveLength(1);
      expect(turns[0]).toEqual({
        status: 'asked',
        question: 'What problem does your product solve?',
        askedAt: ASKED_AT.toISOString(),
      });
    });

    it('sends one system and one user message asking for a single question, and names no model', async () => {
      const model = scriptedLlm([QUESTION]);
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT]),
      });
      await interview.begin('s1');

      await collect(requireStream(await interview.openingQuestion('s1')));

      expect(model.requests).toHaveLength(1);
      const request = model.requests[0];
      expect(request.messages).toHaveLength(2);
      const roles = request.messages.map((message) => message.role);
      expect(roles.filter((role) => role === 'system')).toHaveLength(1);
      expect(roles.filter((role) => role === 'user')).toHaveLength(1);
      const systemMessage =
        request.messages.find((message) => message.role === 'system')
          ?.content ?? '';
      expect(systemMessage.toLowerCase()).toMatch(/\b(one|single)\b/);
      expect(systemMessage.toLowerCase()).toMatch(/question/);
      expect(request.model).toBeUndefined();
    });

    it('serves a concurrent second request from the in-flight production and stores one turn', async () => {
      const model = scriptedLlm(['What problem ', 'does it solve?'], {
        gateAfter: 0,
      });
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT]),
      });
      await interview.begin('s1');

      const firstText = collect(
        requireStream(await interview.openingQuestion('s1')),
      );
      await settle();

      const secondText = collect(
        requireStream(await interview.openingQuestion('s1')),
      );
      await settle();

      model.release();

      expect(await firstText).toBe('What problem does it solve?');
      expect(await secondText).toBe('What problem does it solve?');
      expect(model.requests).toHaveLength(1);
      const turns = store.current('s1')?.state.turns ?? [];
      expect(turns).toHaveLength(1);
      expect(turns[0].question).toBe('What problem does it solve?');
    });

    it('keeps the shared production alive when one of two callers abandons it', async () => {
      const model = scriptedLlm(['What problem ', 'does it ', 'solve?'], {
        gateAfter: 1,
      });
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT]),
      });
      await interview.begin('s1');

      const firstIterator = requireStream(
        await interview.openingQuestion('s1'),
      )[Symbol.asyncIterator]();
      const firstChunk = await firstIterator.next();
      expect(firstChunk.value).toBe('What problem ');

      const secondText = collect(
        requireStream(await interview.openingQuestion('s1')),
      );
      await settle();

      await firstIterator.return?.(undefined);
      await settle();

      model.release();

      expect(await secondText).toBe('What problem does it solve?');
      expect(model.requests).toHaveLength(1);
      expect(model.signals[0]?.aborted).toBe(false);
      const turns = store.current('s1')?.state.turns ?? [];
      expect(turns).toHaveLength(1);
      expect(turns[0].question).toBe('What problem does it solve?');
    });

    it('replays the stored question for a caller that resolved before the save and pulled after it', async () => {
      const secondAskedAt = new Date('2026-02-03T09:09:00.000Z');
      const model = scriptedLlm(['What problem ', 'does it solve?']);
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT, secondAskedAt]),
      });
      await interview.begin('s1');

      const early = requireStream(await interview.openingQuestion('s1'));
      const savedText = await collect(
        requireStream(await interview.openingQuestion('s1')),
      );
      const earlyText = await collect(early);

      expect(model.requests).toHaveLength(1);
      expect(earlyText).toBe(savedText);
      const turns = store.current('s1')?.state.turns ?? [];
      expect(turns).toHaveLength(1);
      expect(turns[0].askedAt).toBe(ASKED_AT.toISOString());
    });

    it('replays the stored question, reaches no model, and leaves askedAt untouched', async () => {
      const model = scriptedLlm(['a fresh question?']);
      const store = memoryStore();
      store.seed(seededSession('s1', [askedTurn('The stored question?')]));
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([new Date('2026-02-05T00:00:00.000Z')]),
      });

      const text = await collect(
        requireStream(await interview.openingQuestion('s1')),
      );

      expect(text).toBe('The stored question?');
      expect(model.requests).toHaveLength(0);
      expect(store.current('s1')?.state.turns[0].askedAt).toBe(
        ASKED_AT.toISOString(),
      );
    });

    it('stores nothing and does not reject when the caller aborts mid-stream', async () => {
      const model = scriptedLlm(['What problem ', 'does it ', 'solve?'], {
        gateAfter: 1,
      });
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT]),
      });
      await interview.begin('s1');

      const controller = new AbortController();
      const iterator = requireStream(
        await interview.openingQuestion('s1', controller.signal),
      )[Symbol.asyncIterator]();
      const firstChunk = await iterator.next();
      expect(firstChunk.value).toBe('What problem ');

      controller.abort();
      model.release();

      await expect(drain(iterator)).resolves.toBeTypeOf('string');
      await settle();

      expect(store.current('s1')?.state.turns).toEqual([]);
      expect(store.saves).toHaveLength(1);
    });

    it('lets the model observe the cancellation without the caller pulling again', async () => {
      let cancellationObserved = false;
      const model: LlmPort = {
        status: () => Promise.resolve({ available: true, models: [] }),
        complete: () => Promise.reject(new Error('never completed')),
        async *stream(request: LlmRequest, signal?: AbortSignal) {
          let index = 0;
          while (signal?.aborted !== true) {
            yield `chunk ${String(index++)} of ${String(request.messages.length)} `;
          }
          cancellationObserved = true;
        },
      };
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT]),
      });
      await interview.begin('s1');

      const controller = new AbortController();
      const iterator = requireStream(
        await interview.openingQuestion('s1', controller.signal),
      )[Symbol.asyncIterator]();
      const firstChunk = await iterator.next();
      expect(firstChunk.value).toBe('chunk 0 of 2 ');

      controller.abort();
      await settle();

      expect(cancellationObserved).toBe(true);
      expect(store.current('s1')?.state.turns).toEqual([]);
    });

    it('releases the model’s stream when the caller abandons it and the model never reads its signal', async () => {
      let released = false;
      const resumeSoon = (): Promise<void> =>
        new Promise((resolve) => {
          queueMicrotask(resolve);
        });
      const model: LlmPort = {
        status: () => Promise.resolve({ available: true, models: [] }),
        complete: () => Promise.reject(new Error('never completed')),
        async *stream() {
          try {
            let index = 0;
            for (;;) {
              await resumeSoon();
              yield `chunk ${String(index++)} `;
            }
          } finally {
            released = true;
          }
        },
      };
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT]),
      });
      await interview.begin('s1');

      const controller = new AbortController();
      const iterator = requireStream(
        await interview.openingQuestion('s1', controller.signal),
      )[Symbol.asyncIterator]();
      const firstChunk = await iterator.next();
      expect(firstChunk.value).toBe('chunk 0 ');

      controller.abort();
      await settle();

      expect(released).toBe(true);
      expect(store.current('s1')?.state.turns).toEqual([]);
    });

    it('rejects a blank question and leaves the turn list empty', async () => {
      const model = scriptedLlm(['  ', '\n', '\t ']);
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT]),
      });
      await interview.begin('s1');

      await expect(
        collect(requireStream(await interview.openingQuestion('s1'))),
      ).rejects.toThrow(/no question/i);

      expect(store.current('s1')?.state.turns).toEqual([]);
    });

    it('propagates the model’s rejection unchanged and leaves the turn list empty', async () => {
      const failure = new Error(
        'cannot reach the language model at http://127.0.0.1:11434/v1',
      );
      const model = rejectingLlm(failure);
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ASKED_AT]),
      });
      await interview.begin('s1');

      const caught = await collect(
        requireStream(await interview.openingQuestion('s1')),
      ).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(caught).toBe(failure);
      expect(store.current('s1')?.state.turns).toEqual([]);
    });

    it('resolves undefined for an unbegun id before any chunk is pulled', async () => {
      const model = scriptedLlm([QUESTION]);
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT]),
      });

      const stream = await interview.openingQuestion('never-begun');

      expect(stream).toBeUndefined();
      expect(model.requests).toHaveLength(0);
    });
  });

  describe('recordAnswer', () => {
    it('completes the turn, advances updatedAt, and leaves createdAt and askedAt alone', async () => {
      const model = scriptedLlm([QUESTION]);
      const store = memoryStore();
      store.seed(
        seededSession('s1', [askedTurn()], {
          createdAt: CREATED_AT,
          updatedAt: ASKED_AT,
        }),
      );
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([ANSWERED_AT]),
      });

      const outcome = await interview.recordAnswer(
        's1',
        'Weeknight dinners for busy families.',
      );

      expect(outcome).toBe('recorded');
      const stored = store.current('s1');
      expect(stored?.state.turns).toEqual([
        {
          status: 'answered',
          question: QUESTION,
          askedAt: ASKED_AT.toISOString(),
          answer: 'Weeknight dinners for busy families.',
          answeredAt: ANSWERED_AT.toISOString(),
        },
      ]);
      expect(stored?.createdAt.getTime()).toBe(CREATED_AT.getTime());
      expect(stored?.updatedAt.getTime()).toBe(ANSWERED_AT.getTime());
      expect(model.requests).toHaveLength(0);
    });

    it('reports no-session for an unbegun id and writes nothing', async () => {
      const model = scriptedLlm([QUESTION]);
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([ANSWERED_AT]),
      });

      const outcome = await interview.recordAnswer('never-begun', 'An answer.');

      expect(outcome).toBe('no-session');
      expect(store.saves).toHaveLength(0);
    });

    it('reports no-open-question over an empty turn list and writes nothing', async () => {
      const model = scriptedLlm([QUESTION]);
      const store = memoryStore();
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([CREATED_AT, ANSWERED_AT]),
      });
      await interview.begin('s1');
      const savesAfterBegin = store.saves.length;

      const outcome = await interview.recordAnswer(
        's1',
        'An answer to nothing.',
      );

      expect(outcome).toBe('no-open-question');
      expect(store.saves).toHaveLength(savesAfterBegin);
      expect(store.current('s1')?.state.turns).toEqual([]);
    });

    it('reports no-open-question, keeps the stored answer, and appends no turn', async () => {
      const model = scriptedLlm([QUESTION]);
      const store = memoryStore();
      const existing = answeredTurn();
      store.seed(seededSession('s1', [existing]));
      const interview = createSingleTurnInterview({
        llm: model.port,
        sessions: store.port,
        clock: fixedClock([new Date('2026-02-06T00:00:00.000Z')]),
      });

      const outcome = await interview.recordAnswer('s1', 'A second answer.');

      expect(outcome).toBe('no-open-question');
      const turns = store.current('s1')?.state.turns ?? [];
      expect(turns).toHaveLength(1);
      expect(turns[0]).toEqual(existing);
    });
  });
});
