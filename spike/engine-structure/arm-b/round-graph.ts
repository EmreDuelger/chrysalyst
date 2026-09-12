/**
 * Arm B's engine: the M3 round as a `StateGraph` with an `interrupt()` between
 * the question and the answer, compiled against the task-5 checkpointer.
 *
 * The round is three nodes rather than two on purpose. `interrupt()` does not
 * suspend a node mid-body — on resume LangGraph re-runs the node it
 * interrupted in from its first line — so a graph that called the model and
 * then interrupted in one node would ask the model a second question on every
 * resume. Splitting the call, the interrupt, and the recording into three
 * nodes is what makes the model call happen exactly once, and it is a
 * constraint the hand-rolled arm has no counterpart for: arm A's
 * `recordAnswer` is an ordinary function call that cannot re-enter anything.
 *
 * The state is deliberately `InterviewState`-shaped — one `turns` channel
 * holding `Turn[]` verbatim — so axis 1's `session.json` comparison measures
 * where LangGraph puts the domain state, not how the spike chose to model it.
 */
import { isAnswered } from '@chrysalyst/core';
import type {
  AnsweredTurn,
  AskedTurn,
  SessionStorePort,
  Turn,
} from '@chrysalyst/core';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  Annotation,
  END,
  START,
  StateGraph,
  interrupt,
} from '@langchain/langgraph';

import {
  OPENING_SYSTEM_PROMPT,
  OPENING_USER_MESSAGE,
} from '../shared/opening-instruction.ts';
import {
  SessionStoreCheckpointer,
  type CheckpointArchive,
} from './session-store-checkpointer.ts';

/** Strips the `<think>…</think>` block reasoning models emit ahead of their answer. */
const THINKING_BLOCK = /<think>[\s\S]*?<\/think>/g;

const RoundState = Annotation.Root({
  turns: Annotation<readonly Turn[]>({
    reducer: (_current, next) => next,
    default: () => [],
  }),
  answer: Annotation<string>({
    reducer: (_current, next) => next,
    default: () => '',
  }),
});

function askOpeningQuestion(model: BaseChatModel) {
  return async (): Promise<{ turns: readonly Turn[] }> => {
    const stream = await model.stream([
      { role: 'system', content: OPENING_SYSTEM_PROMPT },
      { role: 'user', content: OPENING_USER_MESSAGE },
    ]);
    let spoken = '';
    for await (const chunk of stream) {
      spoken += chunk.text;
    }
    const asked: AskedTurn = {
      status: 'asked',
      question: spoken.replace(THINKING_BLOCK, '').trim(),
      askedAt: new Date().toISOString(),
    };
    return { turns: [asked] };
  };
}

function awaitAnswer(state: typeof RoundState.State): { answer: string } {
  const open = state.turns.at(-1);
  if (open === undefined) {
    throw new Error(
      'Cannot await an answer: the round reached the interrupt with no asked turn on the state',
    );
  }
  return { answer: interrupt<string, string>(open.question) };
}

function recordAnswer(state: typeof RoundState.State): {
  turns: readonly Turn[];
} {
  const open = state.turns.at(-1);
  if (open === undefined || isAnswered(open)) {
    throw new Error(
      'Cannot record an answer: the round resumed with no open question on the state',
    );
  }
  const answered: AnsweredTurn = {
    status: 'answered',
    question: open.question,
    askedAt: open.askedAt,
    answer: state.answer,
    answeredAt: new Date().toISOString(),
  };
  return { turns: [...state.turns.slice(0, -1), answered] };
}

/**
 * Compiles the round against a checkpointer over `sessions`.
 *
 * The checkpointer is built here rather than passed in because a compiled
 * graph and its checkpointer are one durable unit: the same store has to back
 * both processes of the round for the resume to find anything.
 */
export function createRoundGraph(
  model: BaseChatModel,
  sessions: SessionStorePort<CheckpointArchive>,
) {
  return new StateGraph(RoundState)
    .addNode('askOpeningQuestion', askOpeningQuestion(model))
    .addNode('awaitAnswer', awaitAnswer)
    .addNode('recordAnswer', recordAnswer)
    .addEdge(START, 'askOpeningQuestion')
    .addEdge('askOpeningQuestion', 'awaitAnswer')
    .addEdge('awaitAnswer', 'recordAnswer')
    .addEdge('recordAnswer', END)
    .compile({ checkpointer: new SessionStoreCheckpointer(sessions) });
}
