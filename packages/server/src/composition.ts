import { renderTranscript } from '@chrysalyst/core';
import type { CoreDependencies, InterviewState } from '@chrysalyst/core';

import { createSystemClock } from './adapters/clock/system-clock.ts';
import {
  createOpenAiCompatibleLlm,
  llmBackendNameFromEnv,
  llmConfigFromEnv,
} from './adapters/llm/openai-compatible-llm.ts';
import {
  createFilesystemSessionStore,
  sessionStoreConfigFromEnv,
} from './adapters/session-store/filesystem-session-store.ts';
import type { BackendDescriptor } from './backend-readiness.ts';

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

/**
 * The backend descriptor `createApp`'s `/status` route names, resolved beside
 * {@link createDependenciesFromEnv} from the same environment.
 *
 * A sibling function rather than a field folded into `CoreDependencies`: the
 * descriptor is presentation for the setup gate, not a dependency the domain
 * runs on, and keeping it separate is what lets `createApp` take it as its own
 * parameter instead of a route resolving the environment a second time. Its
 * model is `llmConfigFromEnv`'s default model — the same resolver
 * `createOpenAiCompatibleLlm` above is built from — so the model the gate names
 * is by construction the model the adapter will send. Resolving it opens no
 * socket and reads no file, the same guarantee `createDependenciesFromEnv`
 * makes.
 */
export function backendDescriptorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): BackendDescriptor {
  return {
    name: llmBackendNameFromEnv(env),
    model: llmConfigFromEnv(env).defaultModel,
  };
}
