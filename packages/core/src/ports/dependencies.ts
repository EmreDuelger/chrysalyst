import type { ClockPort } from './clock.ts';
import type { LlmPort } from './llm.ts';
import type { SearchPort } from './search.ts';
import type { SessionStorePort } from './session-store.ts';

/**
 * Everything the domain must be handed before it can run.
 *
 * Search is the single optional member: chrysalyst interviews without it, only
 * without enrichment. Stating that as an omitted member rather than a flag
 * leaves no way to express "enabled but unwired", and makes the compiler force
 * every caller to handle the absent case.
 */
export interface CoreDependencies<TState> {
  readonly llm: LlmPort;
  readonly sessions: SessionStorePort<TState>;
  readonly clock: ClockPort;
  readonly search?: SearchPort;
}
