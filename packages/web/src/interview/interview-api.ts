import { parseSseFrames, type SseFrame } from './sse-frames.ts';

/**
 * The browser's whole conversation with the interview API.
 *
 * `@chrysalyst/web` declares no workspace package, so it cannot import the
 * server's route or event types. It restates the wire contract here instead —
 * the three SSE payload shapes and the two JSON bodies — and treats
 * `interview/interview-http-api` as the specification both sides are written
 * from (decision-log [4]: the typed `hc` client was declined because it cannot
 * type an SSE event name or payload, which is the larger half of this
 * contract). `tests/fixtures/interview-sse-frames.txt` is that contract's
 * executable half: the route test asserts the server emits those bytes and
 * this module's test asserts they decode back to these shapes, so a rename on
 * either side fails a run rather than only a browser.
 *
 * This module owns the JSON decoding of the wire and every check the frame
 * parser deliberately skips: the parser is total and never throws, so an
 * unknown event name and a malformed `data` payload are rejected here.
 */
export type QuestionEvent =
  | { readonly event: 'token'; readonly text: string }
  | { readonly event: 'done'; readonly question: string }
  | { readonly event: 'error'; readonly message: string };

/** The outcome of offering an answer to the API. */
export type AnswerResult =
  | { readonly outcome: 'recorded' }
  | { readonly outcome: 'refused'; readonly message: string };

/** The transport the client calls, injected so tests never touch the network. */
export type FetchImpl = typeof fetch;

/** The interview API as the view consumes it, with the transport already bound. */
export interface InterviewApi {
  readonly createSession: () => Promise<string>;
  readonly openQuestionStream: (
    id: string,
    signal?: AbortSignal,
  ) => AsyncIterable<QuestionEvent>;
  readonly submitAnswer: (id: string, answer: string) => Promise<AnswerResult>;
}

const SESSION_ROUTE = '/interview';
const CREATED = 201;
const NO_CONTENT = 204;

function questionRoute(id: string): string {
  return `${SESSION_ROUTE}/${encodeURIComponent(id)}/question`;
}

function answerRoute(id: string): string {
  return `${SESSION_ROUTE}/${encodeURIComponent(id)}/answer`;
}

/**
 * Creates an interview session and answers its identifier. Rejects when the
 * API does not confirm the session with a `201`.
 */
export async function createSession(
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const response = await fetchImpl(SESSION_ROUTE, { method: 'POST' });
  if (response.status !== CREATED) {
    throw new Error(
      `Creating an interview session failed: POST ${SESSION_ROUTE} answered ${String(response.status)}`,
    );
  }
  const payload: unknown = await response.json();
  return readString(payload, 'id', 'the session-creation response');
}

/**
 * Streams the opening question as typed events. The signal aborts the fetch;
 * an abort ends the iteration quietly rather than as a failure, matching the
 * server, which treats an abandoned stream as the caller's own doing.
 */
export async function* openQuestionStream(
  id: string,
  fetchImpl: FetchImpl = fetch,
  signal?: AbortSignal,
): AsyncIterable<QuestionEvent> {
  try {
    const response = await fetchImpl(questionRoute(id), { signal });
    const body = response.body;
    if (body === null) {
      throw new Error(
        `The interview question stream for session "${id}" carried no response body`,
      );
    }
    for await (const frame of parseSseFrames(decodeBody(body))) {
      yield toQuestionEvent(frame);
    }
  } catch (cause) {
    if (signal?.aborted === true) return;
    throw cause;
  }
}

/**
 * Offers an answer to the API and reports whether it was recorded or, if not,
 * the message the server gave.
 */
export async function submitAnswer(
  id: string,
  answer: string,
  fetchImpl: FetchImpl = fetch,
): Promise<AnswerResult> {
  const response = await fetchImpl(answerRoute(id), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  });
  if (response.status === NO_CONTENT) {
    return { outcome: 'recorded' };
  }
  return { outcome: 'refused', message: await refusalMessage(response) };
}

/** The interview API bound to the browser's global `fetch`. */
export const browserInterviewApi: InterviewApi = {
  createSession,
  openQuestionStream: (id, signal) => openQuestionStream(id, fetch, signal),
  submitAnswer,
};

async function* decodeBody(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail !== '') yield tail;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function toQuestionEvent(frame: SseFrame): QuestionEvent {
  const payload = parsePayload(frame.data);
  switch (frame.event) {
    case 'token':
      return {
        event: 'token',
        text: readString(payload, 'text', 'a token event'),
      };
    case 'done':
      return {
        event: 'done',
        question: readString(payload, 'question', 'a done event'),
      };
    case 'error':
      return {
        event: 'error',
        message: readString(payload, 'message', 'an error event'),
      };
    default:
      throw new Error(
        `The interview stream carried an unknown event "${frame.event}"`,
      );
  }
}

function parsePayload(data: string): unknown {
  try {
    const parsed: unknown = JSON.parse(data);
    return parsed;
  } catch (cause) {
    throw new Error(
      `The interview stream carried a malformed event payload: ${data}`,
      { cause },
    );
  }
}

async function refusalMessage(response: Response): Promise<string> {
  const fallback = `The API refused the answer with status ${String(response.status)}`;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return fallback;
  }
  return isRecord(payload) && typeof payload.message === 'string'
    ? payload.message
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(payload: unknown, field: string, context: string): string {
  if (isRecord(payload) && typeof payload[field] === 'string') {
    return payload[field];
  }
  throw new Error(
    `${context} carried no string "${field}": ${JSON.stringify(payload)}`,
  );
}
