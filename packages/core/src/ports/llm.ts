/** Who authored one turn of a conversation with the language model. */
export type LlmRole = 'system' | 'user' | 'assistant';

/** One turn of the conversation the domain hands to the language model. */
export interface LlmMessage {
  readonly role: LlmRole;
  readonly content: string;
}

/**
 * A conversation for the language model to answer.
 *
 * It names the turns and, at most, which model should answer them. Sampling
 * parameters and response shapes stay out of it until a use case needs them,
 * so no backend's request format leaks into the domain's vocabulary.
 */
export interface LlmRequest {
  readonly messages: readonly LlmMessage[];
  readonly model?: string;
}

/**
 * What the domain knows about the local inference backend.
 *
 * The model list is always an array, but it may be empty when the backend
 * cannot be asked: an adapter that learns its models by querying the backend
 * has nothing to report once the backend stops answering.
 */
export interface LlmBackendStatus {
  readonly available: boolean;
  readonly models: readonly string[];
}

/**
 * The boundary through which the domain reaches a language model.
 *
 * Stated in conversation terms rather than any provider's HTTP surface, so
 * that Ollama, llama.cpp, and LM Studio are interchangeable behind it. Whole
 * response and incremental response are separate methods because the callers
 * differ: a contradiction check wants the finished text, an interview wants it
 * as it arrives. Every method accepts a signal, because inference on a local
 * machine runs long enough for a user to abandon it mid-answer.
 */
export interface LlmPort {
  /** Answers whether the backend can serve a request, and which models it holds. */
  status(signal?: AbortSignal): Promise<LlmBackendStatus>;

  /** Answers the request as one finished text. */
  complete(request: LlmRequest, signal?: AbortSignal): Promise<string>;

  /** Answers the request as the chunks of text the model produces, in order. */
  stream(request: LlmRequest, signal?: AbortSignal): AsyncIterable<string>;
}
