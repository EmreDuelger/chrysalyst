import type { LlmPort } from '@chrysalyst/core';
import {
  createOpenAiCompatibleLlm,
  llmConfigFromEnv,
} from '@chrysalyst/server/src/adapters/llm/openai-compatible-llm.ts';

/**
 * Builds the real Ollama-backed `LlmPort`, reading `CHRYSALYST_LLM_BASE_URL`
 * and `CHRYSALYST_LLM_MODEL` through the product's own env resolver so both
 * arms are driven by the identical adapter and configuration rules — the
 * live harness measures the real port, not a spike-local stand-in.
 */
export function createSpikeLlm(env: NodeJS.ProcessEnv = process.env): LlmPort {
  return createOpenAiCompatibleLlm(llmConfigFromEnv(env));
}
