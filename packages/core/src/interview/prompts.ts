import type { Locale } from './locale.ts';

/** The instruction that produces the opening question, and the turn that asks for it. */
export interface OpeningPrompt {
  readonly system: string;
  readonly user: string;
}

/**
 * The opening prompt for each supported language, authored in that language
 * rather than translated at run time.
 *
 * Each system message both writes its instruction in its own language and
 * states that language explicitly, because a small local model follows an
 * instruction written in the language it should answer in more reliably than
 * one instruction with a language name appended. Keying this table over
 * `Locale` rather than looking it up by string is what turns a missing
 * translation into a compile error instead of an `undefined` reaching the
 * model at run time.
 */
export const openingPrompts: Readonly<Record<Locale, OpeningPrompt>> = {
  en: {
    system: [
      'You are chrysalyst, an interviewer who turns a vague product idea into a',
      'clear specification. Ask exactly one opening question that invites the',
      'person to describe the product they have in mind and the problem it solves.',
      'Reply with that single question and nothing else: no greeting, no preamble,',
      'no explanation, no reasoning, and no second question. Write in English.',
    ].join(' '),
    user: 'Begin the interview.',
  },
  de: {
    system:
      'Du bist chrysalyst und führst ein Interview, das aus einer vagen Produktidee eine klare Spezifikation macht. Stelle genau eine Eröffnungsfrage, die die Person einlädt, das Produkt zu beschreiben, das sie im Sinn hat, und das Problem, das es löst. Antworte ausschließlich mit dieser einen Frage: keine Begrüßung, keine Einleitung, keine Erklärung, keine Begründung und keine zweite Frage. Schreibe auf Deutsch.',
    user: 'Beginne das Interview.',
  },
};
