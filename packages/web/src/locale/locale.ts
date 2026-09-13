/**
 * The domain's language vocabulary as `packages/core` defines it. This
 * package cannot depend on `@chrysalyst/core`, so it restates the same three
 * values `interview-locales.json` fixes for both sides — a renamed tag, a
 * changed fallback or a renamed request field then fails a run rather than
 * only a browser (see `tests/fixtures/README.md`).
 */
export type Locale = 'de' | 'en';

/** Every language chrysalyst currently supports, in no particular order. */
export const SUPPORTED_LOCALES: readonly Locale[] = ['de', 'en'];

/** The language the interface falls back to when none was detected or chosen. */
export const FALLBACK_LOCALE: Locale = 'en';

/** Where the chosen language is remembered across visits. */
export const LOCALE_STORAGE_KEY = 'chrysalyst.locale';

/** The JSON field a session-creation request names its language with. */
export const CREATE_SESSION_FIELD = 'locale';

/** Each language's own name for itself, for a control that offers both. */
export const LOCALE_ENDONYMS: Readonly<Record<Locale, string>> = {
  de: 'Deutsch',
  en: 'English',
};

/** Narrows an unknown value to {@link Locale} when it names a supported tag. */
export function isLocale(candidate: unknown): candidate is Locale {
  return (
    typeof candidate === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(candidate)
  );
}

/**
 * The language to open the interview in: the remembered choice when it
 * names a supported tag, otherwise the first supported base subtag among the
 * given languages (`de-AT` matches on `de`), otherwise {@link FALLBACK_LOCALE}.
 *
 * Both the language list and the storage are read defensively: a browser can
 * report no languages, and reading `storage.getItem` can itself throw when
 * site data is blocked, so this never lets a hostile environment stop the
 * interview from starting.
 */
export function detectLocale(
  languages: readonly string[] = browserLanguages(),
  storage?: Storage,
): Locale {
  const remembered = rememberedLocale(storage);
  if (remembered !== undefined) return remembered;
  for (const language of languages) {
    const base = language.split('-')[0];
    if (isLocale(base)) return base;
  }
  return FALLBACK_LOCALE;
}

/**
 * Remembers the chosen language for the next visit. Best-effort: a browser
 * that blocks site data can throw on `setItem`, and that is not this
 * function's caller's problem to handle.
 */
export function rememberLocale(locale: Locale, storage?: Storage): void {
  const resolved = storage ?? defaultStorage();
  if (resolved === undefined) return;
  try {
    resolved.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    return;
  }
}

function rememberedLocale(storage: Storage | undefined): Locale | undefined {
  const resolved = storage ?? defaultStorage();
  if (resolved === undefined) return undefined;
  try {
    const value = resolved.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function browserLanguages(): readonly string[] {
  try {
    if (typeof navigator === 'undefined') return [];
    const languages = navigator.languages as readonly string[] | undefined;
    return languages ?? [];
  } catch {
    return [];
  }
}
