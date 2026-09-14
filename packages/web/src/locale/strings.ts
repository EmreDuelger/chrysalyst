import { de } from './de.ts';
import { en } from './en.ts';
import type { Locale } from './locale.ts';

/**
 * Every piece of interface copy the interview shell and view display, in the
 * shape both language dictionaries must satisfy. `recordedAt` is the one
 * entry that interpolates a value — everything else is a fixed string for
 * its language.
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
  readonly languageSwitchLabel: string;
  readonly languageSwitchPrompt: string;
  readonly languageSwitchDiscard: string;
  readonly languageSwitchKeep: string;
}

/** Every supported language's complete copy, keyed by {@link Locale}. */
export const uiStrings: Readonly<Record<Locale, UiStrings>> = { de, en };
