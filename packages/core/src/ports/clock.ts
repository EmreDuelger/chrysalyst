/**
 * The boundary through which the domain learns the current instant.
 *
 * Time arrives as a dependency rather than from the ambient system clock, so
 * that session bookkeeping and interview timestamps are reproducible under
 * test and identical wherever the domain runs.
 */
export interface ClockPort {
  /** Answers the instant the caller should treat as now. */
  now(): Date;
}
