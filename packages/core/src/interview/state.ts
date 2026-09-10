/**
 * A session's domain state, version 1: the turns the interview has produced.
 *
 * A list rather than a single question/answer pair from the start, because M8
 * grows the interview to many turns and a list costs nothing at one element,
 * whereas a pair would force a schema break on the second turn. The session
 * store's `schemaVersion` is unaffected — it versions the on-disk envelope,
 * not the domain state it wraps.
 */
export interface InterviewState {
  readonly turns: readonly Turn[];
}

/**
 * A turn whose question has been asked but not yet answered.
 *
 * This intermediate state is real, not transient: the question is durable the
 * moment the model finishes producing it, which is before any answer exists,
 * and a reconnecting client replays the interview from here.
 */
export interface AskedTurn {
  readonly status: 'asked';
  readonly question: string;
  /**
   * The instant the question was asked, as an ISO 8601 string and never a
   * `Date`: the session store returns everything under `state` exactly as
   * `JSON.parse` produced it, so a `Date` field would be typed `Date` yet
   * arrive as `string` after a round trip.
   */
  readonly askedAt: string;
}

/**
 * A turn whose question has been answered.
 *
 * Carries the answering instant beside the answer so that an answer with no
 * time — a combination that means nothing — cannot be represented.
 */
export interface AnsweredTurn {
  readonly status: 'answered';
  readonly question: string;
  /** The instant the question was asked, ISO 8601 — see {@link AskedTurn.askedAt}. */
  readonly askedAt: string;
  readonly answer: string;
  /** The instant the answer was recorded, ISO 8601 — see {@link AskedTurn.askedAt}. */
  readonly answeredAt: string;
}

/**
 * One turn, before or after its answer.
 *
 * The union is tagged by `status` rather than distinguished by the presence of
 * `answer`, because the tag is the only form TypeScript narrows on after a JSON
 * round trip — a loaded turn is plain data with no class to test against — and
 * the only form that actually excludes a turn mixing an answer with no
 * answering instant, or the reverse.
 */
export type Turn = AskedTurn | AnsweredTurn;

/**
 * Answers whether a turn has been answered, narrowing it to {@link AnsweredTurn}.
 *
 * Tests the `status` tag rather than `'answer' in turn` so that narrowing holds
 * for a turn just parsed back from storage.
 */
export function isAnswered(turn: Turn): turn is AnsweredTurn {
  return turn.status === 'answered';
}
