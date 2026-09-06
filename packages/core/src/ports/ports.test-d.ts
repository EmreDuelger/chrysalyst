import { assertType, describe, expectTypeOf, it } from 'vitest';

type ClockPort = import('@chrysalyst/core').ClockPort;
type CoreDependencies<TState> =
  import('@chrysalyst/core').CoreDependencies<TState>;
type LlmBackendStatus = import('@chrysalyst/core').LlmBackendStatus;
type LlmMessage = import('@chrysalyst/core').LlmMessage;
type LlmPort = import('@chrysalyst/core').LlmPort;
type LlmRequest = import('@chrysalyst/core').LlmRequest;
type LlmRole = import('@chrysalyst/core').LlmRole;
type SearchHit = import('@chrysalyst/core').SearchHit;
type SearchPort = import('@chrysalyst/core').SearchPort;
type SessionId = import('@chrysalyst/core').SessionId;
type SessionStorePort<TState> =
  import('@chrysalyst/core').SessionStorePort<TState>;
type StoredSession<TState> = import('@chrysalyst/core').StoredSession<TState>;

interface DraftSpec {
  readonly title: string;
  readonly answers: readonly string[];
}

const FIXED_INSTANT = new Date('2026-01-01T00:00:00.000Z');

async function* textChunks(): AsyncGenerator<string> {
  const answer = await Promise.resolve(['Wel', 'come']);
  yield* answer;
}

const role = 'assistant' as const;

const message = {
  role: 'assistant',
  content: 'Ask one question at a time.',
} as const;

const request = { messages: [message] } as const;

const requestWithModel = { messages: [message], model: 'llama3.2:3b' } as const;

const backendStatus = { available: false, models: ['llama3.2:3b'] } as const;

const hit = {
  title: 'Hexagonal architecture',
  url: 'https://alistair.cockburn.us/hexagonal-architecture/',
  snippet:
    'Allow an application to equally be driven by users, programs or tests.',
} as const;

const sessionId = 'session-1';

const storedSession = {
  id: sessionId,
  createdAt: FIXED_INSTANT,
  updatedAt: FIXED_INSTANT,
  state: { title: 'Rezept-Planer', answers: ['Kochende Familien'] },
} as const;

const clock = { now: () => new Date(FIXED_INSTANT) };

const llm = {
  status: () => Promise.resolve(backendStatus),
  complete: () => Promise.resolve('Welcome'),
  stream: () => textChunks(),
};

const search = { search: () => Promise.resolve([hit]) };

const sessions = {
  list: () => Promise.resolve([sessionId]),
  load: () => Promise.resolve(storedSession),
  save: () => Promise.resolve(),
};

const dependencies = { llm, sessions, clock };

const dependenciesWithSearch = { llm, sessions, clock, search };

describe('core entry point', () => {
  it('re-exports every port from the entry point', () => {
    expectTypeOf(clock).toExtend<ClockPort>();
    expectTypeOf(llm).toExtend<LlmPort>();
    expectTypeOf(search).toExtend<SearchPort>();
    expectTypeOf(sessions).toExtend<SessionStorePort<DraftSpec>>();
    expectTypeOf(dependencies).toExtend<CoreDependencies<DraftSpec>>();

    expectTypeOf(role).toExtend<LlmRole>();
    expectTypeOf(message).toExtend<LlmMessage>();
    expectTypeOf(request).toExtend<LlmRequest>();
    expectTypeOf(requestWithModel).toExtend<LlmRequest>();
    expectTypeOf(backendStatus).toExtend<LlmBackendStatus>();
    expectTypeOf(hit).toExtend<SearchHit>();
    expectTypeOf(sessionId).toExtend<SessionId>();
    expectTypeOf(storedSession).toExtend<StoredSession<DraftSpec>>();
  });
});

describe('CoreDependencies', () => {
  it('accepts an omitted search and rejects an omitted llm, sessions or clock', () => {
    assertType<CoreDependencies<DraftSpec>>(dependencies);
    assertType<CoreDependencies<DraftSpec>>(dependenciesWithSearch);

    // @ts-expect-error llm is required, so a dependency set without it does not conform
    assertType<CoreDependencies<DraftSpec>>({ sessions, clock });
    // @ts-expect-error sessions is required, so a dependency set without it does not conform
    assertType<CoreDependencies<DraftSpec>>({ llm, clock });
    // @ts-expect-error clock is required, so a dependency set without it does not conform
    assertType<CoreDependencies<DraftSpec>>({ llm, sessions });
  });
});

describe('LlmPort', () => {
  it('rejects a non-conforming implementation', () => {
    const brokenLlm = {
      status: () => Promise.resolve('reachable'),
      complete: () => Promise.resolve('Welcome'),
      stream: () => textChunks(),
    };

    expectTypeOf(brokenLlm).not.toExtend<LlmPort>();

    // @ts-expect-error status resolves to a string rather than an LlmBackendStatus
    assertType<LlmPort>(brokenLlm);
  });
});
