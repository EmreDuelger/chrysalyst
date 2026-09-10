/**
 * The domain's public surface: the four boundaries through which chrysalyst
 * reaches a language model, web search, session storage, and time, the types
 * their signatures name, and the interview logic written against them.
 *
 * The package still declares no dependency and pulls in no adapter — its rules
 * forbid a dependency, not execution. Importing it now emits the interview's
 * runtime bindings, and still opens no socket, reads no file, and touches no
 * clock.
 */
export type * from './ports/index.ts';
export * from './interview/index.ts';
