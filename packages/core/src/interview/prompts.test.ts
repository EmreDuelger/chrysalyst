import { describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES } from './locale.ts';
import type { Locale } from './locale.ts';
import { openingPrompts } from './prompts.ts';

const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  de: 'Deutsch',
};

describe('openingPrompts', () => {
  it.each(SUPPORTED_LOCALES.map((locale) => ({ locale })))(
    'has a non-blank system and user message for $locale',
    ({ locale }) => {
      const template = openingPrompts[locale];

      expect(template.system.trim()).not.toBe('');
      expect(template.user.trim()).not.toBe('');
    },
  );

  it('shares no system message between languages', () => {
    const systemMessages = SUPPORTED_LOCALES.map(
      (locale) => openingPrompts[locale].system,
    );

    expect(new Set(systemMessages).size).toBe(systemMessages.length);
  });

  it('shares no user message between languages', () => {
    const userMessages = SUPPORTED_LOCALES.map(
      (locale) => openingPrompts[locale].user,
    );

    expect(new Set(userMessages).size).toBe(userMessages.length);
  });

  it.each(SUPPORTED_LOCALES.map((locale) => ({ locale })))(
    'names its own language, $locale, in its system message',
    ({ locale }) => {
      const template = openingPrompts[locale];

      expect(template.system).toContain(LOCALE_NAMES[locale]);
    },
  );
});
