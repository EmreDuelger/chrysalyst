import { randomUUID } from 'node:crypto';

import type { SingleTurnInterview } from '@chrysalyst/core';
import { Hono } from 'hono';
import type { HonoRequest } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SSEMessage, SSEStreamingApi } from 'hono/streaming';
import { z } from 'zod';

/**
 * The only shape a submitted answer may take.
 *
 * Blank text is refused rather than trimmed away: an answer of spaces records
 * nothing, and silently storing a trimmed value would answer a person with a
 * transcript they did not write.
 */
const submittedAnswer = z.object({
  answer: z
    .string()
    .refine((answer) => answer.trim() !== '', 'an answer must carry text'),
});

/**
 * One event of the question stream.
 *
 * Every payload is a single line of JSON, which is what keeps the framing total
 * rather than probabilistic: a model chunk carrying a newline stays inside one
 * frame instead of splitting into two.
 */
function questionEvent(name: string, payload: object): SSEMessage {
  return { event: name, data: JSON.stringify(payload) };
}

function failureMessage(failure: unknown): string {
  return failure instanceof Error
    ? failure.message
    : `the opening question failed: ${JSON.stringify(failure)}`;
}

/**
 * Reads the request body as JSON, answering `undefined` when it is not JSON at
 * all — the boundary at which a parser's own failure becomes this module's
 * vocabulary, since no valid JSON body parses to `undefined`.
 */
async function jsonBody(request: HonoRequest): Promise<unknown> {
  try {
    const body: unknown = await request.json();
    return body;
  } catch {
    return undefined;
  }
}

/**
 * Writes the question as it arrives, then announces it.
 *
 * `done` is written only after the iterable ended of its own accord, so a
 * client that observes it is looking at a question the interview has already
 * stored. A stream the client abandoned and a production that failed both end
 * without one: the first announces nothing because nobody is listening, the
 * second because there is no question to announce.
 */
async function writeQuestion(
  stream: SSEStreamingApi,
  question: AsyncIterable<string>,
): Promise<void> {
  const spoken: string[] = [];
  try {
    for await (const chunk of question) {
      if (stream.aborted) {
        return;
      }
      spoken.push(chunk);
      await stream.writeSSE(questionEvent('token', { text: chunk }));
    }
  } catch (failure) {
    await stream.writeSSE(
      questionEvent('error', { message: failureMessage(failure) }),
    );
    return;
  }
  if (stream.aborted) {
    return;
  }
  await stream.writeSSE(questionEvent('done', { question: spoken.join('') }));
}

/**
 * The three routes one round of the interview needs, over the interview they
 * drive.
 *
 * They are chained onto one instance so the returned type carries every route,
 * which is what lets the app derive a client type that cannot be missing one.
 * The whole mapping between the interview's vocabulary and HTTP lives here —
 * absence becomes `404`, a session with no question awaiting an answer becomes
 * `409`, an unusable body becomes `400` — so no status code appears in the
 * domain and no route repeats a decision the domain already made.
 *
 * The session identifier is minted here rather than in the domain, because
 * randomness is ambient nondeterminism exactly like the system clock.
 */
export function createInterviewRoutes(interview: SingleTurnInterview) {
  return new Hono()
    .post('/interview', async (c) => {
      const id = randomUUID();
      await interview.begin(id);
      return c.json({ id }, 201);
    })
    .get('/interview/:id/question', async (c) => {
      const id = c.req.param('id');
      const abandoned = new AbortController();
      const question = await interview.openingQuestion(id, abandoned.signal);
      if (question === undefined) {
        return c.json(
          {
            message: `Cannot open a question: no session ${id} was ever created`,
          },
          404,
        );
      }
      return streamSSE(c, async (stream) => {
        stream.onAbort(() => {
          abandoned.abort();
        });
        await writeQuestion(stream, question);
      });
    })
    .post('/interview/:id/answer', async (c) => {
      const id = c.req.param('id');
      const body = await jsonBody(c.req);
      if (body === undefined) {
        return c.json(
          {
            message: `Cannot record an answer for session ${id}: the request body is not JSON`,
          },
          400,
        );
      }
      const submitted = submittedAnswer.safeParse(body);
      if (!submitted.success) {
        return c.json(
          {
            message: `Cannot record an answer for session ${id}: ${submitted.error.issues[0].message}`,
          },
          400,
        );
      }
      const outcome = await interview.recordAnswer(id, submitted.data.answer);
      if (outcome === 'no-session') {
        return c.json(
          {
            message: `Cannot record an answer: no session ${id} was ever created`,
          },
          404,
        );
      }
      if (outcome === 'no-open-question') {
        return c.json(
          {
            message: `Cannot record an answer: session ${id} has no question awaiting one`,
          },
          409,
        );
      }
      return c.body(null, 204);
    });
}
