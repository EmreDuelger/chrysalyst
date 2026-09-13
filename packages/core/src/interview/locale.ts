/** The languages chrysalyst can conduct an interview in. */
export type Locale = 'de' | 'en';

/** Every language chrysalyst currently supports, in no particular order. */
export const SUPPORTED_LOCALES: readonly Locale[] = ['de', 'en'];

/** The language a session is interviewed in when none was named or understood. */
export const FALLBACK_LOCALE: Locale = 'en';

/** Narrows an unknown value to {@link Locale} when it names a supported tag. */
export function isLocale(candidate: unknown): candidate is Locale {
  return (
    typeof candidate === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(candidate)
  );
}

/**
 * The stored, submitted or reported value as a language, falling back to
 * {@link FALLBACK_LOCALE} when it is neither.
 *
 * The value reaching this function is untrusted on every call site that has
 * one today: a session loaded from disk carries whatever `JSON.parse`
 * produced, and a request body carries whatever the caller sent — neither is
 * typed as `Locale` before this function looks at it. Falling back rather
 * than throwing is what lets an old session or a body-less request keep
 * working; the fallback itself lives in one constant, so changing which
 * language absence resolves to is one line to reverse.
 */
export function resolveLocale(candidate: unknown): Locale {
  return isLocale(candidate) ? candidate : FALLBACK_LOCALE;
}
