/**
 * The interview domain's entry point: the languages it can be held in and the
 * opening prompt for each, its state, the Markdown rendering of that state, and
 * the one-round interview written against `CoreDependencies`.
 *
 * Grouped here so the package root re-exports one module rather than five, and
 * so a later milestone that adds a turn loop or a question tree extends this
 * barrel instead of the package root.
 */
export * from './locale.ts';
export * from './prompts.ts';
export * from './state.ts';
export * from './transcript.ts';
export * from './single-turn-interview.ts';
