import { afterEach, describe, expect, it, vi } from 'vitest';

import * as core from './index.ts';

describe('@chrysalyst/core entry point', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('exposes the interview factory as a value', () => {
    expect(typeof core.createSingleTurnInterview).toBe('function');
  });

  it('exposes the transcript renderer as a value', () => {
    expect(typeof core.renderTranscript).toBe('function');
  });

  it('re-exports the state predicate the interview narrows a turn on', () => {
    expect(typeof core.isAnswered).toBe('function');
  });

  it('reads no clock when imported', async () => {
    const clock = vi.spyOn(globalThis, 'Date');
    vi.resetModules();

    await import('./index.ts');

    expect(clock).not.toHaveBeenCalled();
  });

  it('opens no socket when imported', async () => {
    const fetchImpl = vi.spyOn(globalThis, 'fetch');
    vi.resetModules();

    await import('./index.ts');

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
