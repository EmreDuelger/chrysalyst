import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InterviewState } from '@chrysalyst/core';

import { createSpikeSessionStore } from './store.ts';

describe('shared session store factory', () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'chrysalyst-spike-store-'));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it('saves and loads a session through the real filesystem store with no model involved', async () => {
    const store = createSpikeSessionStore<InterviewState>('arm-a', {
      CHRYSALYST_SESSION_DIR: sandbox,
    });

    const now = new Date('2026-01-01T00:00:00.000Z');
    await store.save({
      id: 'smoke-session',
      createdAt: now,
      updatedAt: now,
      state: { turns: [] },
    });

    const loaded = await store.load('smoke-session');

    expect(loaded?.state).toEqual({ turns: [] });
  });
});
