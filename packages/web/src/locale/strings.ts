import { de } from './de.ts';
import { en } from './en.ts';
import type { Locale } from './locale.ts';

/**
 * Every piece of interface copy the interview shell, view and setup screen
 * display, in the shape both language dictionaries must satisfy. `recordedAt`
 * and the four `setup*` entries taking arguments interpolate a value — every
 * other entry is a fixed string for its language.
 */
export interface UiStrings {
  readonly interviewRegion: string;
  readonly topbarMeta: string;
  readonly questionKicker: string;
  readonly questionPlaceholder: string;
  readonly reachingModel: string;
  readonly streamingAlternative: string;
  readonly answerLabel: string;
  readonly roundHint: string;
  readonly recording: string;
  readonly submit: string;
  readonly recordedAt: (time: string) => string;
  readonly failureLabel: string;
  readonly languageControl: string;
  readonly setupRegion: string;
  readonly setupHeading: string;
  readonly setupChecking: string;
  readonly setupUnreachable: (backend: string) => string;
  readonly setupUnreachableStep: (backend: string) => string;
  readonly setupModelMissing: (backend: string, model: string) => string;
  readonly setupModelMissingStep: (backend: string, model: string) => string;
  readonly setupRecheck: string;
  readonly setupFailureLabel: string;
}

/** Every supported language's complete copy, keyed by {@link Locale}. */
export const uiStrings: Readonly<Record<Locale, UiStrings>> = { de, en };
