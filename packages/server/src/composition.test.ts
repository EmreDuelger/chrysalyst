import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderTranscript } from '@chrysalyst/core';
import type { InterviewState, StoredSession } from '@chrysalyst/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDependenciesFromEnv } from './composition.ts';

describe('createDependenciesFromEnv', () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'chrysalyst-composition-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(sandbox, { recursive: true, force: true });
  });

  function suppliedEnv(): NodeJS.ProcessEnv {
    return {
      CHRYSALYST_LLM_BASE_URL: 'http://127.0.0.1:9999/v1',
      CHRYSALYST_LLM_MODEL: 'composition-test-model',
      CHRYSALYST_SESSION_DIR: join(sandbox, 'sessions'),
    };
  }

  function askedSession(): StoredSession<InterviewState> {
    return {
      id: 'a-session',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:01:00.000Z'),
      state: {
        turns: [
          {
            status: 'asked',
            question: 'What problem does your product solve?',
            askedAt: '2026-01-01T00:00:30.000Z',
          },
        ],
      },
    };
  }

  it('assembles llm, sessions with the transcript renderer, and clock, omits search, and touches no disk', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 503 }));
    const sessionDir = join(sandbox, 'sessions');

    const before = Date.now();
    const deps = createDependenciesFromEnv(suppliedEnv());

    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(access(sessionDir)).rejects.toThrow();

    const now = deps.clock.now();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());

    expect(deps.search).toBeUndefined();

    await deps.llm.status();
    const requestedUrl = fetchSpy.mock.calls[0]?.[0];
    expect(requestedUrl).toBeInstanceOf(URL);
    expect((requestedUrl as URL).href).toContain('http://127.0.0.1:9999/v1');
    fetchSpy.mockRestore();

    const session = askedSession();
    await deps.sessions.save(session);

    const transcript = await readFile(
      join(sessionDir, session.id, 'transcript.md'),
      'utf8',
    );
    expect(transcript).toBe(renderTranscript(session));
  });
});
