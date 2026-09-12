/**
 * Arm A of the engine-structure spike: the hand-rolled turn loop, adapted from
 * `packages/core/src/interview/single-turn-interview.ts`'s
 * `createSingleTurnInterview`.
 *
 * The in-flight guard that lets several callers share one running model
 * production, and the `AbortController`-driven cancellation that stops that
 * shared production once every caller has abandoned it, are both left out on
 * purpose: they are M3 product concerns with no counterpart in arm B's graph,
 * and keeping them would inflate this arm's LOC measurement against nothing.
 * What remains is exactly what plan.md's § The round both arms implement asks
 * for — `SessionStorePort.save`/`load`, called directly with no abstraction
 * over them, which is the cost this arm exists to show.
 */
import { isAnswered } from '@chrysalyst/core';
import type {
  AnsweredTurn,
  AskedTurn,
  CoreDependencies,
  InterviewState,
  LlmRequest,
  SessionId,
} from '@chrysalyst/core';

import {
  OPENING_SYSTEM_PROMPT,
  OPENING_USER_MESSAGE,
} from '../shared/opening-instruction.ts';

/** What recording an answer did, in the same vocabulary as `packages/core`. */
export type AnswerOutcome = 'recorded' | 'no-session' | 'no-open-question';

/** The three operations one round of arm A's turn loop consists of. */
export interface HandRolledTurnLoop {
  /** Persists an empty round under `id`, leaving an existing one exactly as it stands. */
  begin(id: SessionId): Promise<void>;

  /**
   * Streams the session's opening question — asking the model when none is
   * asked yet, replaying the stored one otherwise — and answers `undefined`
   * when no session was ever begun under `id`. The asked turn is persisted
   * only once the model's stream has produced its last chunk, so a caller
   * that finishes iterating is looking at a question already on disk.
   */
  askOpeningQuestion(id: SessionId): Promise<AsyncIterable<string> | undefined>;

  /** Completes the session's open question with this answer. */
  recordAnswer(id: SessionId, answer: string): Promise<AnswerOutcome>;
}

function openingConversation(): LlmRequest {
  return {
    messages: [
      { role: 'system', content: OPENING_SYSTEM_PROMPT },
      { role: 'user', content: OPENING_USER_MESSAGE },
    ],
  };
}

async function* replayStoredQuestion(question: string): AsyncGenerator<string> {
  yield question;
}

/**
 * Builds arm A's turn loop directly over `SessionStorePort.save`/`load` — no
 * abstraction sits between this module and the port, which is the point of
 * this arm.
 */
export function createHandRolledTurnLoop(
  deps: CoreDependencies<InterviewState>,
): HandRolledTurnLoop {
  async function* streamOpeningQuestion(
    id: SessionId,
    createdAt: Date,
    turnsSoFar: InterviewState['turns'],
  ): AsyncGenerator<string> {
    const chunks: string[] = [];
    for await (const chunk of deps.llm.stream(openingConversation())) {
      chunks.push(chunk);
      yield chunk;
    }
    const askedAt = deps.clock.now();
    const asked: AskedTurn = {
      status: 'asked',
      question: chunks.join(''),
      askedAt: askedAt.toISOString(),
    };
    await deps.sessions.save({
      id,
      createdAt,
      updatedAt: askedAt,
      state: { turns: [...turnsSoFar, asked] },
    });
  }

  return {
    async begin(id) {
      const existing = await deps.sessions.load(id);
      if (existing !== undefined) {
        return;
      }
      const now = deps.clock.now();
      await deps.sessions.save({
        id,
        createdAt: now,
        updatedAt: now,
        state: { turns: [] },
      });
    },

    async askOpeningQuestion(id) {
      const session = await deps.sessions.load(id);
      if (session === undefined) {
        return undefined;
      }
      const lastTurn = session.state.turns.at(-1);
      if (lastTurn !== undefined) {
        return replayStoredQuestion(lastTurn.question);
      }
      return streamOpeningQuestion(id, session.createdAt, session.state.turns);
    },

    async recordAnswer(id, answer) {
      const session = await deps.sessions.load(id);
      if (session === undefined) {
        return 'no-session';
      }
      const open = session.state.turns.at(-1);
      if (open === undefined || isAnswered(open)) {
        return 'no-open-question';
      }
      const answeredAt = deps.clock.now();
      const answered: AnsweredTurn = {
        status: 'answered',
        question: open.question,
        askedAt: open.askedAt,
        answer,
        answeredAt: answeredAt.toISOString(),
      };
      await deps.sessions.save({
        id,
        createdAt: session.createdAt,
        updatedAt: answeredAt,
        state: { turns: [...session.state.turns.slice(0, -1), answered] },
      });
      return 'recorded';
    },
  };
}
