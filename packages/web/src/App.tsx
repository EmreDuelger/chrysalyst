import type { JSX } from 'react';

import { Mark } from './assets/Mark.tsx';
import styles from './App.module.css';
import { InterviewView } from './interview/InterviewView.tsx';
import {
  browserInterviewApi,
  type InterviewApi,
} from './interview/interview-api.ts';

/**
 * The browser application shell. It names the product and mounts the interview
 * view, which owns the whole conversation with the API; the shell itself calls
 * no server route. The API client is a prop so a test can drive the view
 * without a network.
 */
export interface AppProps {
  readonly api?: InterviewApi;
}

export function App({ api = browserInterviewApi }: AppProps = {}): JSX.Element {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.wordmark}>
          <Mark className={styles.mark} />
          <h1 className={styles.heading}>chrysalyst</h1>
        </div>
        <span className={styles.meta}>Interview · 01</span>
      </header>
      <InterviewView api={api} />
    </div>
  );
}
