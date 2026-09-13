import { describe, expectTypeOf, it } from 'vitest';

import type { Locale } from './locale.ts';
import type { UiStrings } from './strings.ts';

describe('UiStrings and its per-language record are closed shapes', () => {
  it('rejects a dictionary missing a member and a record missing a language', () => {
    // @ts-expect-error a dictionary missing `languageControl` fails UiStrings
    const incomplete: UiStrings = {
      interviewRegion: 'Interview',
      topbarMeta: 'Interview · 01',
      questionKicker: 'The question',
      questionPlaceholder: 'Preparing the first question',
      reachingModel: 'Reaching the model…',
      streamingAlternative: 'the question is still being written',
      answerLabel: 'Your answer',
      roundHint: 'One question this round.',
      recording: 'Recording…',
      submit: 'Record answer',
      recordedAt: (time: string) => `Recorded · ${time}`,
      failureLabel: 'The question stopped',
    };
    expectTypeOf(incomplete).toExtend<UiStrings>();

    // @ts-expect-error a record missing the `de` language fails Record<Locale, UiStrings>
    const missingLanguage: Readonly<Record<Locale, UiStrings>> = {
      en: incomplete,
    };
    expectTypeOf(missingLanguage).toExtend<
      Readonly<Record<Locale, UiStrings>>
    >();
  });
});
