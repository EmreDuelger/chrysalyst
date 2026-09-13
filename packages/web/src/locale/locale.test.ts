import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CREATE_SESSION_FIELD,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  detectLocale,
  rememberLocale,
} from './locale.ts';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const fixture = JSON.parse(
  readFileSync(
    join(repoRoot, 'tests', 'fixtures', 'interview-locales.json'),
    'utf8',
  ),
) as {
  supported: readonly string[];
  fallback: string;
  createSessionField: string;
};

function stubStorage(remembered: string | null): Storage {
  return {
    length: 0,
    clear: () => undefined,
    key: () => null,
    getItem: () => remembered,
    removeItem: () => undefined,
    setItem: () => undefined,
  };
}

function storageWithThrowingGetter(): Storage {
  return {
    length: 0,
    clear: () => undefined,
    key: () => null,
    get getItem(): Storage['getItem'] {
      throw new Error('site data is blocked');
    },
    removeItem: () => undefined,
    setItem: () => undefined,
  };
}

function storageWithThrowingSetItem(): Storage {
  return {
    length: 0,
    clear: () => undefined,
    key: () => null,
    getItem: () => null,
    removeItem: () => undefined,
    setItem: () => {
      throw new Error('site data is blocked');
    },
  };
}

describe('detectLocale', () => {
  it('answers de for a de-AT list and en for an en-GB list', () => {
    expect(detectLocale(['de-AT'], stubStorage(null))).toBe('de');
    expect(detectLocale(['en-GB'], stubStorage(null))).toBe('en');
  });

  it('falls back for an unsupported list and for an empty one, and takes a supported second preference first', () => {
    expect(detectLocale(['fr-FR'], stubStorage(null))).toBe(FALLBACK_LOCALE);
    expect(detectLocale([], stubStorage(null))).toBe(FALLBACK_LOCALE);
    expect(detectLocale(['fr-FR', 'de-DE'], stubStorage(null))).toBe('de');
  });

  it('prefers a remembered supported tag and ignores a remembered unsupported one', () => {
    expect(detectLocale(['en-US'], stubStorage('de'))).toBe('de');
    expect(detectLocale(['de-AT'], stubStorage('fr'))).toBe('de');
  });

  it('does not throw when reading the storage getter itself throws', () => {
    expect(() =>
      detectLocale(['de-AT'], storageWithThrowingGetter()),
    ).not.toThrow();
    expect(detectLocale(['de-AT'], storageWithThrowingGetter())).toBe('de');
  });

  it('answers the fallback without throwing when the browser reports no language list', () => {
    const stubs: Array<() => void> = [
      () =>
        Object.defineProperty(window.navigator, 'languages', {
          configurable: true,
          get(): readonly string[] {
            throw new Error('language list is blocked');
          },
        }),
      () =>
        Object.defineProperty(window.navigator, 'languages', {
          configurable: true,
          value: undefined,
        }),
    ];

    for (const install of stubs) {
      install();
      try {
        expect(() => detectLocale(undefined, stubStorage(null))).not.toThrow();
        expect(detectLocale(undefined, stubStorage(null))).toBe(
          FALLBACK_LOCALE,
        );
      } finally {
        delete (window.navigator as unknown as { languages?: unknown })
          .languages;
      }
    }
  });
});

describe('rememberLocale', () => {
  it('does not throw when storage.setItem throws', () => {
    expect(() => {
      rememberLocale('de', storageWithThrowingSetItem());
    }).not.toThrow();
  });
});

describe('the shared language fixture', () => {
  it("matches the fixture's supported tags, fallback and creation field name", () => {
    expect(SUPPORTED_LOCALES).toEqual(fixture.supported);
    expect(FALLBACK_LOCALE).toEqual(fixture.fallback);
    expect(CREATE_SESSION_FIELD).toEqual(fixture.createSessionField);
  });
});
