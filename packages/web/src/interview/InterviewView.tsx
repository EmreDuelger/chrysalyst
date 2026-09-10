import { useEffect, useRef, useState, type JSX } from 'react';

import styles from './InterviewView.module.css';
import type { InterviewApi } from './interview-api.ts';

/**
 * One round of the interview in the browser: the question streaming in word by
 * word, a place to answer it, and a plain signal of what the app is doing.
 *
 * The API client is injected rather than imported so no test touches the
 * network, and every state below is behaviour the `interview/interview-view`
 * scenarios pin — the stylesheet (tasks 20-22) restyles what this renders and
 * introduces no state of its own.
 */
export interface InterviewViewProps {
  readonly api: InterviewApi;
}

type Phase =
  | 'connecting'
  | 'streaming'
  | 'complete'
  | 'submitting'
  | 'recorded'
  | 'failed';

const STREAMING_ALTERNATIVE = 'the question is still being written';
const ANSWER_FIELD_ID = 'interview-answer';

export function InterviewView({ api }: InterviewViewProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const abandoned = (): boolean => controller.signal.aborted;

    const fail = (cause: unknown): void => {
      if (abandoned()) return;
      setFailure(messageOf(cause));
      setPhase('failed');
    };

    const run = async (): Promise<void> => {
      let id: string;
      try {
        id = await api.createSession();
      } catch (cause) {
        fail(cause);
        return;
      }
      if (abandoned()) return;
      sessionId.current = id;
      try {
        for await (const event of api.openQuestionStream(
          id,
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
  }, [api]);

  const submit = async (): Promise<void> => {
    const id = sessionId.current;
    if (
      submitting.current ||
      id === null ||
      phase !== 'complete' ||
      answer.trim() === ''
    ) {
      return;
    }
    submitting.current = true;
    setPhase('submitting');
    try {
      const result = await api.submitAnswer(id, answer);
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

  const showAnswerForm =
    phase === 'streaming' || phase === 'complete' || phase === 'submitting';
  const answerDisabled = phase !== 'complete';
  const submitDisabled = phase !== 'complete' || answer.trim() === '';

  return (
    <section className={styles.view} aria-label="Interview">
      <p className={styles.kicker} aria-hidden="true">
        The question
      </p>

      {phase === 'connecting' ? (
        <p className={`${styles.question} ${styles.placeholder}`}>
          Preparing the first question
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
          Reaching the model…
        </p>
      ) : null}

      {phase === 'streaming' ? (
        <p className={styles.note} role="status">
          {STREAMING_ALTERNATIVE}
        </p>
      ) : null}

      {failure !== null ? (
        <div className={styles.error}>
          <div className={styles.errorBody}>
            <p className={styles.errorLabel} aria-hidden="true">
              The question stopped
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
            Your answer
          </label>
          <textarea
            className={styles.answerField}
            id={ANSWER_FIELD_ID}
            value={answer}
            disabled={answerDisabled}
            onChange={(event) => {
              setAnswer(event.target.value);
            }}
          />
          <div className={styles.actions}>
            {phase === 'complete' ? (
              <span className={styles.hint}>One question this round.</span>
            ) : null}
            {phase === 'submitting' ? (
              <span className={styles.hint} role="status">
                Recording…
              </span>
            ) : null}
            <button
              className={styles.submit}
              type="submit"
              disabled={submitDisabled}
            >
              Record answer
              <span aria-hidden="true">&nbsp;&rarr;</span>
            </button>
          </div>
        </form>
      ) : null}

      {phase === 'recorded' ? (
        <div className={styles.answerBlock}>
          <span className={styles.answerLabel}>Your answer</span>
          <p className={styles.savedAnswer}>{answer}</p>
          <p className={styles.confirm} role="status">
            Recorded · {recordedAt} · saved to this session
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
