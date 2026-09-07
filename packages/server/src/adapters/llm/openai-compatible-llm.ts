import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LlmBackendStatus, LlmPort, LlmRequest } from '@chrysalyst/core';
import { generateText, streamText } from 'ai';

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1';
const DEFAULT_MODEL = 'llama3.2:3b';
const PROVIDER_NAME = 'openai-compatible';
const UNREACHABLE: LlmBackendStatus = { available: false, models: [] };

/** How a caller points the adapter at one OpenAI-compatible endpoint. */
export interface OpenAiCompatibleLlmConfig {
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Confines the fact that a language model is reached over HTTP to this module.
 *
 * The endpoint is a parameter rather than a subclass because Ollama, LM Studio,
 * and a llama.cpp server all serve the same OpenAI wire format on loopback —
 * they differ by base URL and model name, not by protocol. Callers upstream of
 * `LlmPort` therefore never learn which of them is answering.
 *
 * The three methods divide along what a caller can do about failure. `status`
 * answers "can I interview at all?", so it resolves for every outcome it
 * actually observed and reserves rejection for a probe that was cancelled
 * before it learned anything. `complete` and `stream` translate a transport
 * failure into an error naming the configured endpoint, keeping the SDK's own
 * error as `cause`, so no caller has to know the `ai` error taxonomy. A
 * cancellation is the caller's own doing: `complete` lets it pass through
 * untranslated, and `stream` ends after the chunks already delivered. Tearing
 * down a socket mid-answer still surfaces as a transport failure even when the
 * caller is the one who asked for it, so a cancelled `stream` discards that
 * failure rather than blaming an endpoint the caller never lost.
 */
export function createOpenAiCompatibleLlm(
  config: OpenAiCompatibleLlmConfig,
): LlmPort {
  const transport = config.fetch ?? globalThis.fetch;
  const provider = createOpenAICompatible({
    name: PROVIDER_NAME,
    baseURL: config.baseUrl,
    fetch: transport,
  });
  const modelsUrl = new URL('models', withTrailingSlash(config.baseUrl));
  const modelFor = (request: LlmRequest): ReturnType<typeof provider> =>
    provider(request.model ?? config.defaultModel);

  return {
    async status(signal?: AbortSignal): Promise<LlmBackendStatus> {
      try {
        const response = await transport(modelsUrl, { signal });
        if (!response.ok) {
          return UNREACHABLE;
        }
        const body: unknown = await response.json();
        if (!isModelList(body)) {
          return UNREACHABLE;
        }
        return {
          available: true,
          models: body.data.map((model) => model.id),
        };
      } catch (error) {
        if (cancelled(signal)) {
          throw error;
        }
        return UNREACHABLE;
      }
    },

    async complete(request: LlmRequest, signal?: AbortSignal): Promise<string> {
      try {
        const answer = await generateText({
          model: modelFor(request),
          messages: [...request.messages],
          maxRetries: 0,
          abortSignal: signal,
        });
        return answer.text;
      } catch (error) {
        if (cancelled(signal)) {
          throw error;
        }
        throw unreachable(config.baseUrl, error);
      }
    },

    async *stream(
      request: LlmRequest,
      signal?: AbortSignal,
    ): AsyncGenerator<string> {
      let reported: unknown;
      const answer = streamText({
        model: modelFor(request),
        messages: [...request.messages],
        maxRetries: 0,
        abortSignal: signal,
        onError: ({ error }) => {
          reported = error;
        },
      });

      try {
        yield* answer.textStream;
      } catch (error) {
        if (cancelled(signal)) {
          return;
        }
        throw unreachable(config.baseUrl, error);
      }

      if (reported !== undefined && !cancelled(signal)) {
        throw unreachable(config.baseUrl, reported);
      }
    },
  };
}

/**
 * The single place Ollama's loopback defaults are written down.
 *
 * Keeping them here rather than in the adapter is what lets one adapter serve
 * every OpenAI-compatible backend: a second backend adds a sibling resolver,
 * not a second implementation. The environment is passed in rather than read
 * from ambient state so the resolution stays a pure function of its input, and
 * nothing here touches the filesystem — chrysalyst gains no dotenv loader.
 */
export function llmConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OpenAiCompatibleLlmConfig {
  return {
    baseUrl: orDefault(env.CHRYSALYST_LLM_BASE_URL, DEFAULT_BASE_URL),
    defaultModel: orDefault(env.CHRYSALYST_LLM_MODEL, DEFAULT_MODEL),
  };
}

function orDefault(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' ? fallback : value;
}

function withTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function cancelled(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function unreachable(baseUrl: string, cause: unknown): Error {
  return new Error(`Cannot reach the language model at ${baseUrl}`, { cause });
}

interface ModelList {
  readonly data: readonly { readonly id: string }[];
}

function isModelList(body: unknown): body is ModelList {
  return (
    typeof body === 'object' &&
    body !== null &&
    'data' in body &&
    Array.isArray(body.data) &&
    body.data.every(namesAModel)
  );
}

function namesAModel(entry: unknown): boolean {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'id' in entry &&
    typeof entry.id === 'string'
  );
}
