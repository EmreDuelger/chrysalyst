import { renderTranscript } from '@chrysalyst/core';
import type { CoreDependencies, InterviewState } from '@chrysalyst/core';

import { createSystemClock } from './adapters/clock/system-clock.ts';
import {
  createOpenAiCompatibleLlm,
  llmConfigFromEnv,
} from './adapters/llm/openai-compatible-llm.ts';
import {
  createFilesystemSessionStore,
  sessionStoreConfigFromEnv,
} from './adapters/session-store/filesystem-session-store.ts';

/**
 * The composition root: the one place in chrysalyst where a concrete adapter is
 * constructed, so every module below it depends on a port and never on a
 * transport, a directory layout, or a system call.
 *
 * The environment is a parameter rather than read from ambient state, so the
 * assembly stays a pure function of its input and a test drives it with a
 * record it controls. Resolving the set wires adapters together and reads
 * nothing: no socket opens, no file is read, and no session directory is
 * created until a caller actually saves.
 *
 * `search` is omitted rather than stubbed — no adapter implements it yet, and
 * `CoreDependencies` makes that an absent member the compiler forces callers to
 * handle. The interview's transcript renderer is `@chrysalyst/core`'s own and
 * is passed by reference: it and the store's config share the port's
 * `StoredSession<InterviewState>` signature, so no adapting lambda stands
 * between them.
 */
export function createDependenciesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CoreDependencies<InterviewState> {
  return {
    llm: createOpenAiCompatibleLlm(llmConfigFromEnv(env)),
    sessions: createFilesystemSessionStore<InterviewState>({
      ...sessionStoreConfigFromEnv(env),
      renderTranscript,
    }),
    clock: createSystemClock(),
  };
}
