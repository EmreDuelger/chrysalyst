import type { LlmBackendStatus, LlmPort } from '@chrysalyst/core';

const AVAILABLE: LlmBackendStatus = { available: true, models: ['scripted'] };

/**
 * A hermetic `LlmPort` that streams a fixed chunk list regardless of the
 * request, so both arms' hermetic harnesses run with no daemon and no
 * network while producing identical model output — axis 4's testability
 * question is answered by whether each arm can run against this same fake.
 */
export function createScriptedLlm(chunks: readonly string[]): LlmPort {
  return {
    async status(): Promise<LlmBackendStatus> {
      return AVAILABLE;
    },
    async complete(): Promise<string> {
      return chunks.join('');
    },
    async *stream(): AsyncGenerator<string> {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}
