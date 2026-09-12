/**
 * Arm B, task 7's harness: drives the guardrail-compliant binding — a
 * `BaseChatModel` over chrysalyst's `LlmPort` — against the shared fake port,
 * with no daemon and no network.
 *
 * The role-mapping case is the one that carries weight: `LlmPort` speaks
 * `system | user | assistant` and LangChain speaks `system | human | ai`, so
 * whether the binding is a rename or a translation is decided here.
 */
import type { LlmPort, LlmRequest } from '@chrysalyst/core';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import { createScriptedLlm } from '../shared/fake-llm.ts';
import { LlmPortChatModel } from './llm-port-chat-model.ts';

function recordingLlm(chunks: readonly string[]): {
  llm: LlmPort;
  requests: LlmRequest[];
} {
  const scripted = createScriptedLlm(chunks);
  const requests: LlmRequest[] = [];
  return {
    requests,
    llm: {
      status: scripted.status.bind(scripted),
      async complete(request) {
        requests.push(request);
        return scripted.complete(request);
      },
      stream(request) {
        requests.push(request);
        return scripted.stream(request);
      },
    },
  };
}

describe('LlmPortChatModel', () => {
  it('answers one AIMessage carrying everything the port produced', async () => {
    const model = new LlmPortChatModel({
      llm: createScriptedLlm(['What ', 'problem?']),
    });

    const answer = await model.invoke([new HumanMessage('Begin.')]);

    expect(answer.text).toBe('What problem?');
  });

  it('streams the port chunks in order', async () => {
    const model = new LlmPortChatModel({
      llm: createScriptedLlm(['What ', 'problem ', 'does it solve?']),
    });

    const spoken: string[] = [];
    for await (const chunk of await model.stream([
      new HumanMessage('Begin.'),
    ])) {
      spoken.push(chunk.text);
    }

    expect(spoken).toEqual(['What ', 'problem ', 'does it solve?']);
  });

  it("translates LangChain's message types into the port's three roles", async () => {
    const { llm, requests } = recordingLlm(['ok']);
    const model = new LlmPortChatModel({ llm });

    await model.invoke([
      new SystemMessage('Be terse.'),
      new HumanMessage('Begin.'),
      new AIMessage('A question.'),
    ]);

    expect(requests[0]?.messages).toEqual([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'Begin.' },
      { role: 'assistant', content: 'A question.' },
    ]);
  });

  it('passes the configured model name through to the port', async () => {
    const { llm, requests } = recordingLlm(['ok']);
    const model = new LlmPortChatModel({ llm, model: 'qwen3:8b' });

    await model.invoke([new HumanMessage('Begin.')]);

    expect(requests[0]?.model).toBe('qwen3:8b');
  });

  it('rejects a message type the port has no role for', async () => {
    const model = new LlmPortChatModel({ llm: createScriptedLlm(['ok']) });

    await expect(
      model.invoke([{ role: 'tool', content: 'x', tool_call_id: 'c' }]),
    ).rejects.toThrow(/tool/);
  });
});
