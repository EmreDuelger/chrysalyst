import type { ClockPort } from '@chrysalyst/core';

/**
 * Confines the one reading of the machine's wall clock to a single adapter.
 *
 * `new Date()` is ambient nondeterminism exactly like a socket read or a file
 * open: a call site that reaches for it directly cannot be reproduced under
 * test and drifts between environments. Behind `ClockPort` the domain receives
 * the instant as data and every test hands it a scripted clock instead, so the
 * system clock is wired in once at the composition root rather than scattered
 * through the code that needs to know the time.
 */
export function createSystemClock(): ClockPort {
  return {
    now: () => new Date(),
  };
}
