import { describe, expect, it } from 'vitest';

import type {
  ClockPort,
  LlmPort,
  LlmRequest,
  SearchHit,
  SearchPort,
  SessionId,
  SessionStorePort,
  StoredSession,
} from './index.ts';

interface DraftSpec {
  readonly title: string;
  readonly answers: readonly string[];
}

const FIXED_INSTANT = new Date('2026-01-01T00:00:00.000Z');

const GREETING: LlmRequest = {
  messages: [{ role: 'user', content: 'Greet me.' }],
};

function stubLlm(
  chunks: readonly string[],
  models: readonly string[],
): LlmPort {
  return {
    async status() {
      return { available: false, models };
    },
    async complete() {
      return chunks.join('');
    },
    async *stream(_request, signal) {
      for (const chunk of chunks) {
        if (signal?.aborted === true) {
          return;
        }
        yield chunk;
      }
    },
  };
}

function memorySessionStore<TState>(): SessionStorePort<TState> {
  const stored = new Map<SessionId, StoredSession<TState>>();
  return {
    async list() {
      return [...stored.keys()];
    },
    async load(id) {
      return stored.get(id);
    },
    async save(session) {
      stored.set(session.id, session);
    },
  };
}

const UNREADABLE_RECORD = Symbol('a record present but unreadable');

function guardedSessionStore<TState>(
  unreadable: readonly SessionId[],
): SessionStorePort<TState> {
  const stored = new Map<
    SessionId,
    StoredSession<TState> | typeof UNREADABLE_RECORD
  >(unreadable.map((id) => [id, UNREADABLE_RECORD]));
  return {
    async list() {
      return [...stored.keys()];
    },
    async load(id) {
      const record = stored.get(id);
      if (record === UNREADABLE_RECORD) {
        throw new Error(`session ${id} is present but cannot be read back`);
      }
      return record;
    },
    async save(session) {
      stored.set(session.id, session);
    },
  };
}

function stubSearch(hits: readonly SearchHit[]): SearchPort {
  return {
    async search() {
      return hits;
    },
  };
}

function fixedClock(instant: Date): ClockPort {
  return { now: () => new Date(instant) };
}

function draftSession(id: SessionId): StoredSession<DraftSpec> {
  return {
    id,
    createdAt: FIXED_INSTANT,
    updatedAt: FIXED_INSTANT,
    state: { title: 'Rezept-Planer', answers: ['Kochende Familien'] },
  };
}

describe('LlmPort', () => {
  it('streams chunks in order', async () => {
    const llm = stubLlm(['Wel', 'come'], []);

    const received: string[] = [];
    for await (const chunk of llm.stream(GREETING)) {
      received.push(chunk);
    }

    expect(received).toEqual(['Wel', 'come']);
    expect(received.join('')).toBe('Welcome');
  });

  it('completes a request without an iterator', async () => {
    const llm = stubLlm(['Wel', 'come'], []);

    const answer: string = await llm.complete(GREETING);

    expect(answer).toBe('Welcome');
    expect(typeof answer).toBe('string');
  });

  it('reports an unavailable backend with its model list', async () => {
    const llm = stubLlm([], ['llama3.2:3b', 'qwen2.5:7b']);

    const status = await llm.status();

    expect(status.available).toBe(false);
    expect(status.models).toEqual(['llama3.2:3b', 'qwen2.5:7b']);
  });

  it('stops streaming once the signal aborts', async () => {
    const llm = stubLlm(['Wel', 'come'], []);
    const signal = AbortSignal.abort();

    const received: string[] = [];
    for await (const chunk of llm.stream(GREETING, signal)) {
      received.push(chunk);
    }

    expect(received).toEqual([]);
  });
});

describe('SessionStorePort', () => {
  it('round-trips a stored session', async () => {
    const sessions = memorySessionStore<DraftSpec>();
    const saved = draftSession('session-1');

    await sessions.save(saved);
    const loaded = await sessions.load('session-1');

    expect(loaded).toEqual(saved);
    expect(loaded?.state.title).toBe('Rezept-Planer');
  });

  it('resolves undefined for an unknown session', async () => {
    const sessions = memorySessionStore<DraftSpec>();

    await expect(sessions.load('never-saved')).resolves.toBeUndefined();
  });

  it('lists the identifier of every stored session', async () => {
    const sessions = memorySessionStore<DraftSpec>();

    await sessions.save(draftSession('session-1'));
    await sessions.save(draftSession('session-2'));

    await expect(sessions.list()).resolves.toEqual(['session-1', 'session-2']);
  });

  it('rejects a load over an unreadable record, reserves undefined for one never saved, and lists without rejecting', async () => {
    const sessions = guardedSessionStore<DraftSpec>(['session-2']);
    const saved = draftSession('session-1');

    await sessions.save(saved);

    await expect(sessions.load('session-2')).rejects.toThrow();
    await expect(sessions.load('never-saved')).resolves.toBeUndefined();
    await expect(sessions.load('session-1')).resolves.toEqual(saved);
    await expect(sessions.list()).resolves.toEqual(['session-2', 'session-1']);
  });
});

describe('SearchPort', () => {
  it('returns hits carrying title, url and snippet', async () => {
    const search = stubSearch([
      {
        title: 'Hexagonal architecture',
        url: 'https://alistair.cockburn.us/hexagonal-architecture/',
        snippet:
          'Allow an application to equally be driven by users, programs or tests.',
      },
    ]);

    const hits = await search.search('hexagonal architecture');

    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({
      title: 'Hexagonal architecture',
      url: 'https://alistair.cockburn.us/hexagonal-architecture/',
      snippet:
        'Allow an application to equally be driven by users, programs or tests.',
    });
  });
});

describe('ClockPort', () => {
  it('returns the injected instant', () => {
    const clock = fixedClock(FIXED_INSTANT);

    expect(clock.now()).toEqual(FIXED_INSTANT);
    expect(clock.now()).toEqual(clock.now());
  });
});
