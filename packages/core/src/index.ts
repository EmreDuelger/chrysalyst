/**
 * The domain's public surface: the four boundaries through which chrysalyst
 * reaches a language model, web search, session storage, and time, together
 * with the types their signatures name.
 *
 * Declarations only — this package ships no implementation, so importing it
 * emits no runtime binding and pulls in no adapter.
 */
export type * from './ports/index.ts';
