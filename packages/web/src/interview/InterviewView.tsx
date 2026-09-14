import { useEffect, useRef, useState, type JSX } from 'react';

import styles from './InterviewView.module.css';
import type { CreatedSession, InterviewApi } from './interview-api.ts';
import type { Locale } from '../locale/locale.ts';
import { uiStrings } from '../locale/strings.ts';

/**
 * One round of the interview in the browser: the question streaming in word by
 * word, a place to answer it, and a plain signal of what the app is doing.
 *
 * The API client is injected rather than imported so no test touches the
 * network, and every state below is behaviour the `interview/interview-view`
 * scenarios pin — the stylesheet restyles what this renders and introduces no
 * state of its own.
 *
 * `locale` is the chrome's language and may change while the view is on
 * screen; every label re-renders in it. The session's language is a different
 * value: it is fixed at creation, comes back from the API, and is what the
 * question region declares. Because that second value cannot be changed once
 * its session exists, changing `locale` mid-round restarts the interview in a
 * second session — asking first when that would discard text the person has
 * typed and can still see, and relabelling and nothing more once the answer
 * is on the wire.
 *
 * The restart fires on a *change* in `locale` — detected against `chosen`,
 * the chrome language the view has already acted on — never on a standing
 * difference from the round's language. A standing condition would re-assert
 * itself on the very next render after a decline, so the request could never
 * actually be dismissed.
 */
export interface InterviewViewProps {
  readonly api: InterviewApi;
  readonly locale: Locale;
}

type Phase =
  | 'connecting'
  | 'streaming'
  | 'complete'
  | 'submitting'
  | 'recorded'
  | 'failed';

/**
 * Which round is running and the language it was started FOR — never the
 * language the creation response named, which lives in `session.locale`. The
 * two are allowed to differ, so a restart trigger reading the response would
 * restart again on every answer that differed, forever. `index` makes a
 * restart into the round's own language a new value, so the effect re-runs;
 * it is never rendered.
 */
interface Round {
  readonly index: number;
  readonly locale: Locale;
}

/**
 * A round is open while it can still be restarted — that is, until the answer
 * is on the wire. Openness decides whether a switch restarts at all; whether
 * a draft is at risk decides on its own whether it asks first.
 */
const OPEN_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  'connecting',
  'streaming',
  'complete',
  'failed',
]);

const ANSWER_FIELD_ID = 'interview-answer';

export function InterviewView({
  api,
  locale,
}: InterviewViewProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [session, setSession] = useState<CreatedSession | null>(null);
  const [round, setRound] = useState<Round>(() => ({ index: 0, locale }));
  const [chosen, setChosen] = useState<Locale>(locale);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const region = useRef<HTMLElement>(null);
  const answerField = useRef<HTMLTextAreaElement>(null);
  const copy = uiStrings[locale];

  const showAnswerForm =
    phase === 'streaming' || phase === 'complete' || phase === 'submitting';
  const draftAtRisk = showAnswerForm && answer.trim() !== '';

  const beginRound = (next: Locale): void => {
    setRound((current) => ({ index: current.index + 1, locale: next }));
  };

  if (locale !== chosen) {
    setChosen(locale);
    if (locale === round.locale) setPending(false);
    else if (OPEN_PHASES.has(phase)) {
      if (draftAtRisk) setPending(true);
      else beginRound(locale);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const abandoned = (): boolean => controller.signal.aborted;

    const fail = (cause: unknown): void => {
      if (abandoned()) return;
      setFailure(messageOf(cause));
      setPhase('failed');
    };

    const run = async (): Promise<void> => {
      setQuestion('');
      setAnswer('');
      setSession(null);
      setFailure(null);
      setRecordedAt(null);
      setPhase('connecting');
      setPending(false);
      submitting.current = false;

      let created: CreatedSession;
      try {
        created = await api.createSession(round.locale);
      } catch (cause) {
        fail(cause);
        return;
      }
      if (abandoned()) return;
      setSession(created);
      try {
        for await (const event of api.openQuestionStream(
          created.id,
          controller.signal,
        )) {
          if (abandoned()) return;
          if (event.event === 'token') {
            setQuestion((text) => text + event.text);
            setPhase((current) =>
              current === 'connecting' ? 'streaming' : current,
            );
          } else if (event.event === 'done') {
            setPhase((current) =>
              current === 'failed' ? current : 'complete',
            );
          } else {
            setFailure(event.message);
            setPhase('failed');
          }
        }
      } catch (cause) {
        fail(cause);
      }
    };

    void run();
    return () => {
      controller.abort();
    };
  }, [api, round]);

  const submit = async (): Promise<void> => {
    if (
      submitting.current ||
      session === null ||
      phase !== 'complete' ||
      answer.trim() === ''
    ) {
      return;
    }
    submitting.current = true;
    setPending(false);
    setPhase('submitting');
    try {
      const result = await api.submitAnswer(session.id, answer);
      if (result.outcome === 'recorded') {
        setRecordedAt(clockLabel(new Date()));
        setPhase('recorded');
      } else {
        setFailure(result.message);
        setPhase('failed');
      }
    } catch (cause) {
      setFailure(messageOf(cause));
      setPhase('failed');
    } finally {
      submitting.current = false;
    }
  };

  const changeAnswer = (next: string): void => {
    setAnswer(next);
    if (next.trim() !== '' || !pending) return;
    setPending(false);
    if (locale !== round.locale) beginRound(locale);
  };

  const keepAnswer = (): void => {
    setPending(false);
    answerField.current?.focus();
  };

  const discardAnswer = (): void => {
    setPending(false);
    beginRound(locale);
    region.current?.focus();
  };

  const answerDisabled = phase !== 'complete';
  const submitDisabled = phase !== 'complete' || answer.trim() === '';
  const asking = pending && OPEN_PHASES.has(phase) && draftAtRisk;

  return (
    <section
      className={styles.view}
      aria-label={copy.interviewRegion}
      ref={region}
      tabIndex={-1}
    >
      <p className={styles.kicker} aria-hidden="true">
        {copy.questionKicker}
      </p>

      {phase === 'connecting' ? (
        <p className={`${styles.question} ${styles.placeholder}`}>
          {copy.questionPlaceholder}
          <span className={styles.cursorRule} aria-hidden="true" />
        </p>
      ) : null}

      <p
        className={
          phase === 'failed'
            ? `${styles.question} ${styles.frozen}`
            : styles.question
        }
        aria-live="polite"
        lang={session?.locale}
        hidden={phase === 'connecting'}
      >
        {question}
        {phase === 'streaming' || phase === 'failed' ? (
          <span
            className={
              phase === 'failed'
                ? `${styles.cursorRule} ${styles.cursorStill}`
                : styles.cursorRule
            }
            aria-hidden="true"
          />
        ) : null}
      </p>

      {phase === 'connecting' ? (
        <p className={styles.note} role="status">
          {copy.reachingModel}
        </p>
      ) : null}

      {phase === 'streaming' ? (
        <p className={styles.note} role="status">
          {copy.streamingAlternative}
        </p>
      ) : null}

      {failure !== null ? (
        <div className={styles.error}>
          <div className={styles.errorBody}>
            <p className={styles.errorLabel} aria-hidden="true">
              {copy.failureLabel}
            </p>
            <p className={styles.errorMessage} role="alert">
              {failure}
            </p>
          </div>
        </div>
      ) : null}

      {showAnswerForm ? (
        <form
          className={styles.answerBlock}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={styles.answerLabel} htmlFor={ANSWER_FIELD_ID}>
            {copy.answerLabel}
          </label>
          <textarea
            className={styles.answerField}
            id={ANSWER_FIELD_ID}
            ref={answerField}
            value={answer}
            disabled={answerDisabled}
            onChange={(event) => {
              changeAnswer(event.target.value);
            }}
          />
          <div className={styles.actions}>
            {phase === 'complete' ? (
              <span className={styles.hint}>{copy.roundHint}</span>
            ) : null}
            {phase === 'submitting' ? (
              <span className={styles.hint} role="status">
                {copy.recording}
              </span>
            ) : null}
            <button
              className={styles.submit}
              type="submit"
              disabled={submitDisabled}
            >
              {copy.submit}
              <span aria-hidden="true">&nbsp;&rarr;</span>
            </button>
          </div>
        </form>
      ) : null}

      {asking ? (
        <div className={styles.switchRequest}>
          <p className={styles.switchLabel} aria-hidden="true">
            {copy.languageSwitchLabel}
          </p>
          <p className={styles.switchPrompt} role="alert">
            {copy.languageSwitchPrompt}
          </p>
          <div className={styles.switchActions}>
            <button
              className={styles.switchKeep}
              type="button"
              onClick={keepAnswer}
            >
              {copy.languageSwitchKeep}
            </button>
            <button
              className={styles.switchDiscard}
              type="button"
              onClick={discardAnswer}
            >
              {copy.languageSwitchDiscard}
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'recorded' && recordedAt !== null ? (
        <div className={styles.answerBlock}>
          <span className={styles.answerLabel}>{copy.answerLabel}</span>
          <p className={styles.savedAnswer}>{answer}</p>
          <p className={styles.confirm} role="status">
            {copy.recordedAt(recordedAt)}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The interview could not be loaded';
}

function clockLabel(now: Date): string {
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
