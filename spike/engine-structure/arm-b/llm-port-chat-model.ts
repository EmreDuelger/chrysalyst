/**
 * Arm B's guardrail-compliant chat-model binding: a `BaseChatModel` whose
 * whole implementation is a call to chrysalyst's existing `LlmPort`.
 *
 * This is plan.md § Arm B's chat-model binding's second row — the only binding
 * under which LangGraph could actually enter this codebase, because it keeps
 * the one LLM integration the `LlmPort`-Adapter guardrail fixed rather than
 * adding LangChain's alongside it. Its LOC and its outcome are the number that
 * decides axis 4's binding cell.
 *
 * `BaseChatModel` asks a subclass for three things and no more: `_llmType()`,
 * `_generate()`, and — to get streaming rather than a single buffered chunk —
 * an override of `_streamResponseChunks()`. `lc_namespace`, `_modelType()`,
 * `generatePrompt()`, `invoke()`, `stream()`, the callback plumbing, and the
 * caching path are all inherited. Nothing here reaches past those three
 * documented members into `@langchain/core` internals.
 *
 * The one translation that is not a rename: LangChain types a message
 * `system | human | ai | tool | function | developer | remove`, and `LlmPort`
 * knows `system | user | assistant`. Three map across; the rest have no
 * domain meaning, so the binding rejects them by name rather than guessing.
 */
import type { LlmMessage, LlmPort, LlmRole } from '@chrysalyst/core';
import {
  BaseChatModel,
  type BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs';

const ROLES: Readonly<Record<string, LlmRole>> = {
  system: 'system',
  human: 'user',
  ai: 'assistant',
};

/** How a caller points the binding at a port, and optionally at one model. */
export interface LlmPortChatModelParams extends BaseChatModelParams {
  readonly llm: LlmPort;
  readonly model?: string;
}

function toLlmMessage(message: BaseMessage): LlmMessage {
  const role = ROLES[message.getType()];
  if (role === undefined) {
    throw new Error(
      `Cannot send a ${message.getType()} message through LlmPort: the port's conversation has the roles system, user and assistant, and nothing this maps onto`,
    );
  }
  return { role, content: message.text };
}

/**
 * A LangChain chat model backed by chrysalyst's `LlmPort`.
 *
 * Deliberately carries no sampling parameters, no tool binding, and no
 * structured output: `LlmRequest` names messages and at most a model, and a
 * binding that invented options the port cannot carry would be measuring
 * something this spike is not asking about.
 */
export class LlmPortChatModel extends BaseChatModel {
  readonly #llm: LlmPort;
  readonly #model?: string;

  constructor(params: LlmPortChatModelParams) {
    super(params);
    this.#llm = params.llm;
    this.#model = params.model;
  }

  _llmType(): string {
    return 'chrysalyst-llm-port';
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
  ): Promise<ChatResult> {
    const spoken = await this.#llm.complete(
      this.#toRequest(messages),
      options.signal,
    );
    return {
      generations: [{ text: spoken, message: new AIMessage(spoken) }],
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
  ): AsyncGenerator<ChatGenerationChunk> {
    for await (const chunk of this.#llm.stream(
      this.#toRequest(messages),
      options.signal,
    )) {
      yield new ChatGenerationChunk({
        text: chunk,
        message: new AIMessageChunk(chunk),
      });
    }
  }

  #toRequest(messages: BaseMessage[]) {
    return {
      messages: messages.map(toLlmMessage),
      ...(this.#model === undefined ? {} : { model: this.#model }),
    };
  }
}
