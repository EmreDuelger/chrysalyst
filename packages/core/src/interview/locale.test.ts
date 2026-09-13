import fixture from '../../../../tests/fixtures/interview-locales.json';

import { describe, expect, it } from 'vitest';

import {
  FALLBACK_LOCALE,
  isLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from './locale.ts';

describe('SUPPORTED_LOCALES and FALLBACK_LOCALE', () => {
  it('match the shared language fixture', () => {
    expect(SUPPORTED_LOCALES).toEqual(fixture.supported);
    expect(FALLBACK_LOCALE).toEqual(fixture.fallback);
  });
});

describe('isLocale', () => {
  it.each(SUPPORTED_LOCALES.map((locale) => ({ locale })))(
    'accepts the supported tag $locale',
    ({ locale }) => {
      expect(isLocale(locale)).toBe(true);
    },
  );

  it.each([
    { label: 'an unsupported tag', candidate: 'fr' },
    { label: 'a wrongly-cased tag', candidate: 'DE' },
    { label: 'an empty string', candidate: '' },
    { label: 'undefined', candidate: undefined },
    { label: 'null', candidate: null },
    { label: 'a number', candidate: 42 },
    { label: 'an object', candidate: { locale: 'en' } },
  ])('rejects $label', ({ candidate }) => {
    expect(isLocale(candidate)).toBe(false);
  });
});

describe('resolveLocale', () => {
  it.each(SUPPORTED_LOCALES.map((locale) => ({ locale })))(
    'answers $locale for the supported value $locale',
    ({ locale }) => {
      expect(resolveLocale(locale)).toBe(locale);
    },
  );

  it.each([
    { label: 'an unsupported tag', candidate: 'fr' },
    { label: 'a wrongly-cased tag', candidate: 'DE' },
    { label: 'an empty string', candidate: '' },
    { label: 'undefined', candidate: undefined },
    { label: 'null', candidate: null },
    { label: 'a number', candidate: 42 },
    { label: 'an object', candidate: { locale: 'en' } },
  ])('answers the fallback locale for $label', ({ candidate }) => {
    expect(resolveLocale(candidate)).toBe(FALLBACK_LOCALE);
  });
});
