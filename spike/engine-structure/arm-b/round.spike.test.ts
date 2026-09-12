/**
 * Task 8's harness: proves arm B's round runs hermetically — no Ollama, no
 * network — by driving the task-6 graph's interrupt and resume entirely
 * through the task-7 binding (`LlmPortChatModel`) over the shared fake
 * `LlmPort` and a `mkdtemp` store, mirroring `arm-a/round.spike.test.ts`.
 *
 * This formalises what `arm-b/binding-drives-node.check.ts` already showed
 * as a plain script into real assertions collected by `pnpm vitest run
 * arm-b` — plan.md's § Manual Testing "Arm B, hermetic" row.
 *
 * Context7 was queried for `@langchain/core/utils/testing` before writing
 * this file (see arm-b.json's axis-4 "hermetic arm-B round with no Ollama"
 * entry for the finding): it publishes `FakeListChatModel`, a fake
 * `BaseChatModel` that plays back a scripted response list and supports
 * streaming. It is not used here — the task-7 binding already reaches the
 * shared fake `LlmPort` at 70 LOC with no `@langchain/core` internals
 * touched, so routing through a second, LangChain-specific fake would add a
 * dependency this spike does not need to prove the point.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFilesystemSessionStore } from '@chrysalyst/server/src/adapters/session-store/filesystem-session-store.ts';
import { Command, INTERRUPT, isInterrupted } from '@langchain/langgraph';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createScriptedLlm } from '../shared/fake-llm.ts';
import { recordMeasurement } from '../shared/metrics.ts';
import { LlmPortChatModel } from './llm-port-chat-model.ts';
import { createRoundGraph } from './round-graph.ts';
import type { CheckpointArchive } from './session-store-checkpointer.ts';

const QUESTION_CHUNKS = ['What ', 'problem?'];
const ANSWER = 'A tool that turns vague product ideas into clear specs.';
const THREAD_ID = 'round-under-test';

describe('arm B round: LangGraph over LlmPortChatModel and SessionStoreCheckpointer', () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'chrysalyst-spike-arm-b-'));
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it('interrupts after the opening question and resumes with the answer through Command({ resume }) — hermetically, over the shared fake LlmPort', async () => {
    const graph = createRoundGraph(
      new LlmPortChatModel({ llm: createScriptedLlm(QUESTION_CHUNKS) }),
      createFilesystemSessionStore<CheckpointArchive>({ rootDir: sandbox }),
    );
    const config = { configurable: { thread_id: THREAD_ID } };

    const asked = await graph.invoke({ turns: [], answer: '' }, config);

    expect(isInterrupted<string>(asked)).toBe(true);
    if (!isInterrupted<string>(asked)) {
      throw new Error('unreachable: asserted above');
    }
    expect(asked[INTERRUPT][0].value).toBe(QUESTION_CHUNKS.join(''));

    const done = await graph.invoke(new Command({ resume: ANSWER }), config);

    expect(done.turns).toHaveLength(1);
    const [turn] = done.turns;
    expect(turn).toMatchObject({
      status: 'answered',
      question: QUESTION_CHUNKS.join(''),
      answer: ANSWER,
    });
    if (turn?.status !== 'answered') {
      throw new Error('unreachable: asserted above');
    }
    expect(new Date(turn.askedAt).toISOString()).toBe(turn.askedAt);
    expect(new Date(turn.answeredAt).toISOString()).toBe(turn.answeredAt);
    expect(Date.parse(turn.answeredAt)).toBeGreaterThanOrEqual(
      Date.parse(turn.askedAt),
    );

    await recordMeasurement('arm-b', {
      axis: 4,
      metric: 'arm-b/round.spike.test.ts: hermetic round, formalised',
      value:
        'achievable via arm-b/llm-port-chat-model.ts’s LlmPortChatModel binding over the shared fake LlmPort, at 70 LOC — the interrupt and the cross-invocation resume both pass with no Ollama and no network, collected by `pnpm vitest run arm-b`',
    });
  });
});
