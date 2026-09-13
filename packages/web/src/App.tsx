import { useEffect, useState, type ChangeEvent, type JSX } from 'react';

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

const LANGUAGE_CONTROL_ID = 'chrysalyst-language';

/**
 * The browser application shell. It names the product, offers a control for
 * the interface language, and mounts the interview view in that language;
 * the view owns the whole conversation with the API, the shell itself calls
 * no server route. The API client, the starting language and the storage
 * are props so a test can drive the shell without a network, a real
 * browser language, or real site storage.
 */
export interface AppProps {
  readonly api?: InterviewApi;
  readonly locale?: Locale;
  readonly storage?: Storage;
  readonly languages?: readonly string[];
}

export function App({
  api = browserInterviewApi,
  locale: initialLocale,
  storage,
  languages,
}: AppProps = {}): JSX.Element {
  const [locale, setLocale] = useState<Locale>(
    () => initialLocale ?? detectLocale(languages, storage),
  );
  const copy = uiStrings[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const chooseLocale = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value;
    if (!isLocale(next)) return;
    setLocale(next);
    rememberLocale(next, storage);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.wordmark}>
          <Mark className={styles.mark} />
          <h1 className={styles.heading}>chrysalyst</h1>
        </div>
        <span className={styles.meta}>{copy.topbarMeta}</span>
        <div>
          <label htmlFor={LANGUAGE_CONTROL_ID}>{copy.languageControl}</label>
          <select
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
      <InterviewView api={api} locale={locale} />
    </div>
  );
}
