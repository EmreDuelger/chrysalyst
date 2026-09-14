import { useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react';

import { Mark } from './assets/Mark.tsx';
import styles from './App.module.css';
import { InterviewView } from './interview/InterviewView.tsx';
import {
  browserInterviewApi,
  type InterviewApi,
} from './interview/interview-api.ts';
import {
  LOCALE_ENDONYMS,
  SUPPORTED_LOCALES,
  detectLocale,
  isLocale,
  rememberLocale,
  type Locale,
} from './locale/locale.ts';
import { uiStrings } from './locale/strings.ts';
import { SetupGuide, type SetupGuideProps } from './setup/SetupGuide.tsx';
import {
  browserBackendProbe,
  type BackendProbe,
} from './setup/backend-status.ts';

const LANGUAGE_CONTROL_ID = 'chrysalyst-language';
const CHECKING_LABEL_ID = 'chrysalyst-backend-checking';

/**
 * The browser application shell. It names the product, offers a control for
 * the interface language, and — once the backend has answered that an
 * interview can be held at all — mounts the interview view in that language;
 * the view owns the whole conversation with the API, and the status probe is
 * the one server route the shell calls itself. The API client, the starting
 * language, the storage and the probe are props so a test can drive the shell
 * without a network, a real browser language, or real site storage.
 */
export interface AppProps {
  readonly api?: InterviewApi;
  readonly locale?: Locale;
  readonly storage?: Storage;
  readonly languages?: readonly string[];
  readonly probeBackend?: BackendProbe;
}

/**
 * What the shell knows about the backend right now. The two blocked outcomes
 * are exactly {@link SetupGuideProps.blocked}, so the state the shell holds is
 * the prop the setup screen takes — there is nothing to translate between
 * deciding and explaining.
 */
type GateState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'ready' }
  | SetupGuideProps['blocked'];

export function App({
  api = browserInterviewApi,
  locale: initialLocale,
  storage,
  languages,
  probeBackend = browserBackendProbe,
}: AppProps = {}): JSX.Element {
  const [locale, setLocale] = useState<Locale>(
    () => initialLocale ?? detectLocale(languages, storage),
  );
  const [gate, setGate] = useState<GateState>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const checking = useRef<HTMLElement>(null);
  const recheckControl = useRef<HTMLButtonElement>(null);
  const focusStep = useRef<'none' | 'checking' | 'control'>('none');
  const copy = uiStrings[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();

    const run = async (): Promise<void> => {
      let answer: GateState;
      try {
        const readiness = await probeBackend();
        answer = readiness.ready
          ? { kind: 'ready' }
          : {
              kind: 'fault',
              reason: readiness.reason,
              backend: readiness.backend,
              model: readiness.model,
            };
      } catch (cause) {
        answer = { kind: 'failure', message: messageOf(cause) };
      }
      if (controller.signal.aborted) return;
      setGate(answer);
    };

    void run();
    return () => {
      controller.abort();
    };
  }, [probeBackend, attempt]);

  useEffect(() => {
    if (gate.kind === 'checking' && focusStep.current === 'checking') {
      focusStep.current = 'control';
      checking.current?.focus();
      return;
    }
    const showsGuidance = gate.kind !== 'checking' && gate.kind !== 'ready';
    if (!showsGuidance || focusStep.current !== 'control') return;
    focusStep.current = 'none';
    recheckControl.current?.focus();
  }, [gate]);

  const chooseLocale = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value;
    if (!isLocale(next)) return;
    setLocale(next);
    rememberLocale(next, storage);
  };

  const checkAgain = (): void => {
    focusStep.current = 'checking';
    setGate({ kind: 'checking' });
    setAttempt((count) => count + 1);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.wordmark}>
          <Mark className={styles.mark} />
          <h1 className={styles.heading}>chrysalyst</h1>
        </div>
        <span className={styles.meta}>{copy.topbarMeta}</span>
        <div className={styles.languageField}>
          <label className={styles.languageLabel} htmlFor={LANGUAGE_CONTROL_ID}>
            {copy.languageControl}
          </label>
          <select
            className={styles.languageSelect}
            id={LANGUAGE_CONTROL_ID}
            value={locale}
            onChange={chooseLocale}
          >
            {SUPPORTED_LOCALES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {LOCALE_ENDONYMS[candidate]}
              </option>
            ))}
          </select>
        </div>
      </header>
      {gate.kind === 'ready' ? (
        <InterviewView api={api} locale={locale} />
      ) : (
        <div className={styles.gate} aria-live="polite">
          {gate.kind === 'checking' ? (
            <section
              className={styles.checking}
              aria-labelledby={CHECKING_LABEL_ID}
              tabIndex={-1}
              ref={checking}
            >
              <p className={styles.checkingLabel} id={CHECKING_LABEL_ID}>
                {copy.setupChecking}
              </p>
            </section>
          ) : (
            <SetupGuide
              locale={locale}
              blocked={gate}
              onCheckAgain={checkAgain}
              controlRef={recheckControl}
            />
          )}
        </div>
      )}
    </div>
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
