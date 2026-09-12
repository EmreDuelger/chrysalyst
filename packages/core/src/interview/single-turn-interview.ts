import { isAnswered } from './state.ts';
import type { AnsweredTurn, AskedTurn, InterviewState } from './state.ts';
import type {
  CoreDependencies,
  LlmRequest,
  SessionId,
  StoredSession,
} from '../ports/index.ts';

/**
 * The instruction that produces the opening question, and the turn that asks
 * for it.
 *
 * Both are constants of this module rather than configuration: the wording is
 * a fact about how chrysalyst interviews, not a knob a caller should reach.
 * They are English because every interface string in this milestone is; M5 is
 * the milestone that externalises prompts and strings per locale.
 */
const OPENING_SYSTEM_PROMPT = [
  'You are chrysalyst, an interviewer who turns a vague product idea into a',
  'clear specification. Ask exactly one opening question that invites the',
  'person to describe the product they have in mind and the problem it solves.',
  'Reply with that single question and nothing else: no greeting, no preamble,',
  'no explanation, no reasoning, and no second question.',
].join(' ');

  const OPENING_USER_MESSAGE = 'Begin the interview.';

/**
 * What recording an answer did, in the interview's own vocabulary.
 *
 * A stale link and a resubmitted form are ordinary outcomes rather than
 * failures, so they are answered rather than thrown; the caller owns the
 * mapping to a status code and no status code appears here.
 */
export type AnswerOutcome = 'recorded' | 'no-session' | 'no-open-question';

/** The three operations one round of the interview consists of. */
export interface SingleTurnInterview {
  /**
   * Opens a session under the given identifier, leaving an identifier that
   * already holds one exactly as it stands rather than resetting its turns.
   */
  begin(id: SessionId): Promise<void>;

  /**
   * Answers the session's opening question as the chunks it is made of, or
   * `undefined` when no session was ever begun under that identifier — the
   * same vocabulary the session store uses for absence.
   *
   * Resolving is what decides existence and pulling is what reaches the model,
   * so a caller can refuse the request before opening a stream and nothing is
   * inferred for a request that is refused. A session that already holds a
   * turn replays its stored question and reaches no model. The `signal` ends
   * this caller's iteration alone; see {@link createSingleTurnInterview} for
   * why it never reaches the model.
   */
  openingQuestion(
    id: SessionId,
    signal?: AbortSignal,
  ): Promise<AsyncIterable<string> | undefined>;

  /**
   * Completes the session's open question with this answer, reporting instead
   * when there is no such session or no question left to answer.
   */
  recordAnswer(id: SessionId, answer: string): Promise<AnswerOutcome>;
}

/**
 * One run of the model, shared by every caller waiting for the same session's
 * opening question.
 *
 * The chunk log is what lets a caller that arrived late receive the whole
 * question, and `result` — settled only once the asked turn is on disk — is
 * what lets any of them end its iteration knowing the question is durable.
 * Callers drive the model by advancing it, so nothing runs ahead of the slowest
 * of them and no chunk is stored before it was delivered.
 *
 * Cancelling the run advances it one final time and then returns the model's
 * iterator, because the two reach different streams. The advance is for a
 * stream that reads its signal between chunks: it learns it was cancelled only
 * when it is resumed, and only then can it run its own shutdown to the end. The
 * return is for a stream that never reads the signal: nothing would resume it
 * again, so it is finalised instead and its cleanup runs rather than the model
 * being held for the life of the process. Advancing first is what leaves the
 * signal-reading stream free to finish on its own terms.
 */
interface QuestionProduction {
  readonly chunks: readonly string[];
  readonly result: Promise<string>;
  readonly finished: boolean;
  join(): void;
  leave(): void;
  advance(): Promise<void>;
}

function openingConversation(): LlmRequest {
  return {
    messages: [
      { role: 'system', content: OPENING_SYSTEM_PROMPT },
      { role: 'user', content: OPENING_USER_MESSAGE },
    ],
  };
}

function ignoreUnobservedRejection(): undefined {
  return undefined;
}

function startProduction(
  deps: CoreDependencies<InterviewState>,
  session: StoredSession<InterviewState>,
  productions: Map<SessionId, QuestionProduction>,
): QuestionProduction {
  const controller = new AbortController();
  const chunks: string[] = [];
  const iterator = deps.llm
    .stream(openingConversation(), controller.signal)
    [Symbol.asyncIterator]();

  let settle!: {
    resolve: (question: string) => void;
    reject: (reason: unknown) => void;
  };
  const result = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  void result.catch(ignoreUnobservedRejection);

  let finished = false;
  let callers = 0;
  let pending: Promise<void> | undefined;

  const forget = (): void => {
    if (productions.get(session.id) === production) {
      productions.delete(session.id);
    }
  };

  const failWith = (reason: unknown): void => {
    finished = true;
    forget();
    settle.reject(reason);
  };

  const endProduction = async (): Promise<void> => {
    if (controller.signal.aborted) {
      failWith(
        new Error(
          `the opening question of session ${session.id} was abandoned by every caller before the model finished`,
        ),
      );
      return;
    }
    const question = chunks.join('');
    if (question.trim() === '') {
      failWith(
        new Error(
          `the language model produced no question for session ${session.id}: its stream ended after blank text alone`,
        ),
      );
      return;
    }
    const askedAt = deps.clock.now();
    const asked: AskedTurn = {
      status: 'asked',
      question,
      askedAt: askedAt.toISOString(),
    };
    try {
      await deps.sessions.save({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: askedAt,
        state: { turns: [...session.state.turns, asked] },
      });
    } catch (error) {
      failWith(error);
      return;
    }
    finished = true;
    forget();
    settle.resolve(question);
  };

  const pullChunk = async (): Promise<void> => {
    try {
      const step = await iterator.next();
      if (step.done === true) {
        await endProduction();
      } else {
        chunks.push(step.value);
      }
    } catch (error) {
      failWith(error);
    } finally {
      pending = undefined;
    }
  };

  const production: QuestionProduction = {
    chunks,
    result,
    get finished(): boolean {
      return finished;
    },
    join: (): void => {
      callers += 1;
    },
    leave: (): void => {
      callers -= 1;
      if (callers > 0 || finished) {
        return;
      }
      forget();
      controller.abort();
      void production.advance();
      void Promise.resolve(iterator.return?.()).catch(
        ignoreUnobservedRejection,
      );
    },
    advance: (): Promise<void> => {
      pending ??= pullChunk();
      return pending;
    },
  };
  return production;
}

function replayStoredQuestion(question: string): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]: () => {
      let delivered = false;
      return {
        next: (): Promise<IteratorResult<string>> => {
          if (delivered) {
            return Promise.resolve({ done: true, value: undefined });
          }
          delivered = true;
          return Promise.resolve({ done: false, value: question });
        },
      };
    },
  };
}

/**
 * Conducts one round of the interview over the dependencies it is handed.
 *
 * One round is the whole vocabulary on purpose: M7 owns the question tree and
 * M8 the turn loop, so any structure built for them here would be a guess made
 * without their requirements. Binding the dependencies once is what keeps every
 * caller free of plumbing, and reaching the model, the store and the clock only
 * through them is what keeps this module free of a socket, a file and an
 * ambient clock.
 *
 * The asked turn is saved only once the model's stream ended of its own accord
 * and produced something other than blank text, and a caller's iteration ends
 * only after that save resolved — so a caller that reached the end of the
 * question is looking at a question already on disk, and an abandoned, rejected
 * or blank production leaves nothing behind.
 *
 * One production of the question serves every caller waiting on it, which is
 * what makes the model reachable once per session rather than once per request.
 * A shared production therefore cannot belong to any one caller: the interview
 * owns an `AbortController` per production and hands the model **its** signal,
 * never a caller's. A caller's own signal ends that caller's iteration alone,
 * and the production is cancelled only once every caller sharing it has
 * abandoned it — the moment that last caller's signal aborts rather than at the
 * model's next chunk, so a model that has stopped producing is let go of instead
 * of waited on. The guard holding those productions is a map in this closure and
 * so process-local: one process reaches the model once per session, while
 * two processes over one session directory can still produce two questions.
 *
 * Which production a caller belongs to is decided on its first pull, against a
 * session loaded at that moment rather than the one resolving its request saw.
 * A caller whose request resolved while the turn list was still empty may pull
 * only after another caller's production saved and was let go of; loading again
 * there is what makes it replay the stored question instead of running the model
 * a second time over a snapshot that save has already superseded.
 */
export function createSingleTurnInterview(
  deps: CoreDependencies<InterviewState>,
): SingleTurnInterview {
  const productions = new Map<SessionId, QuestionProduction>();

  const productionFor = (
    session: StoredSession<InterviewState>,
  ): QuestionProduction => {
    const running = productions.get(session.id);
    if (running !== undefined) {
      return running;
    }
    const started = startProduction(deps, session, productions);
    productions.set(session.id, started);
    return started;
  };

  async function* streamQuestion(
    id: SessionId,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<string> {
    const current = await deps.sessions.load(id);
    if (current === undefined) {
      return;
    }
    const stored = current.state.turns.at(-1);
    if (stored !== undefined) {
      yield stored.question;
      return;
    }
    const production = productionFor(current);
    production.join();
    let sharing = true;
    const abandon = (): void => {
      if (!sharing) {
        return;
      }
      sharing = false;
      production.leave();
    };
    signal?.addEventListener('abort', abandon, { once: true });
    try {
      let delivered = 0;
      while (signal?.aborted !== true) {
        if (delivered < production.chunks.length) {
          yield production.chunks[delivered];
          delivered += 1;
          continue;
        }
        if (production.finished) {
          await production.result;
          return;
        }
        await production.advance();
      }
    } finally {
      signal?.removeEventListener('abort', abandon);
      abandon();
    }
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

    async openingQuestion(id, signal) {
      const session = await deps.sessions.load(id);
      if (session === undefined) {
        return undefined;
      }
      const lastTurn = session.state.turns.at(-1);
      if (lastTurn !== undefined) {
        return replayStoredQuestion(lastTurn.question);
      }
      return streamQuestion(id, signal);
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
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: answeredAt,
        state: { turns: [...session.state.turns.slice(0, -1), answered] },
      });
      return 'recorded';
    },
  };
}
