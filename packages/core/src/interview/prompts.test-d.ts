import { describe, expectTypeOf, it } from 'vitest';

import type { Locale } from './locale.ts';
import type { OpeningPrompt } from './prompts.ts';

describe('a prompt table missing a language fails the type check', () => {
  it('rejects a prompt table missing a supported language', () => {
    // @ts-expect-error a table missing the 'de' member is not a complete Record<Locale, OpeningPrompt>
    const incomplete: Readonly<Record<Locale, OpeningPrompt>> = {
      en: { system: 'You are chrysalyst.', user: 'Begin the interview.' },
    };

    expectTypeOf(incomplete).toExtend<
      Readonly<Record<Locale, OpeningPrompt>>
    >();
  });
});
