/** One web result the domain may cite while enriching an answer. */
export interface SearchHit {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

/**
 * The boundary through which the domain enriches an answer with web results.
 *
 * It describes only what enrichment needs, never a search engine's query
 * syntax or result envelope. An interview runs to completion without this
 * port at all, which is why `CoreDependencies` admits its absence rather than
 * demanding a placeholder that returns nothing.
 */
export interface SearchPort {
  /** Answers the query with the hits worth citing, most relevant first. */
  search(query: string, signal?: AbortSignal): Promise<readonly SearchHit[]>;
}
