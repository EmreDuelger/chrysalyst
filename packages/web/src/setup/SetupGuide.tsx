import type { JSX, Ref } from 'react';

import styles from './SetupGuide.module.css';
import type { BackendFault } from './backend-status.ts';
import type { Locale } from '../locale/locale.ts';
import { uiStrings, type UiStrings } from '../locale/strings.ts';

/** A fault the shell can name, with the values the guidance needs to name it. */
type BlockedByFault = {
  readonly kind: 'fault';
  readonly reason: BackendFault;
  readonly backend: string;
  readonly model: string;
};

export interface SetupGuideProps {
  readonly locale: Locale;
  /** The fault to explain, or the raw message of a probe that failed. */
  readonly blocked:
    BlockedByFault | { readonly kind: 'failure'; readonly message: string };
  readonly onCheckAgain: () => void;
  /** The seam the shell uses to return focus to the control after a re-check. */
  readonly controlRef?: Ref<HTMLButtonElement>;
}

/**
 * The setup screen a person sees while chrysalyst cannot hold an interview.
 * Props in, markup out: it fetches nothing and holds no state, so the module
 * that decides whether the backend is ready (the shell) stays separate from
 * the module that explains what to do about it. Every label comes from
 * {@link uiStrings}; the backend name, the model name and a failed probe's
 * message are values rendered exactly as they arrived, never translated.
 */
export function SetupGuide({
  locale,
  blocked,
  onCheckAgain,
  controlRef,
}: SetupGuideProps): JSX.Element {
  const copy = uiStrings[locale];

  return (
    <section className={styles.guide} aria-label={copy.setupRegion}>
      <h2 className={styles.heading}>{copy.setupHeading}</h2>
      <div className={styles.body}>
        {blocked.kind === 'fault' ? (
          <>
            <p className={styles.diagnosis}>{diagnosis(copy, blocked)}</p>
            <p className={styles.action}>{action(copy, blocked)}</p>
          </>
        ) : (
          <>
            <p className={styles.failureLabel} aria-hidden="true">
              {copy.setupFailureLabel}
            </p>
            <p className={styles.failureMessage} role="alert">
              {blocked.message}
            </p>
          </>
        )}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.recheck}
          onClick={onCheckAgain}
          ref={controlRef}
        >
          {copy.setupRecheck}
        </button>
      </div>
    </section>
  );
}

function diagnosis(copy: UiStrings, blocked: BlockedByFault): string {
  return blocked.reason === 'unreachable'
    ? copy.setupUnreachable(blocked.backend)
    : copy.setupModelMissing(blocked.backend, blocked.model);
}

function action(copy: UiStrings, blocked: BlockedByFault): string {
  return blocked.reason === 'unreachable'
    ? copy.setupUnreachableStep(blocked.backend)
    : copy.setupModelMissingStep(blocked.backend, blocked.model);
}
