import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import type { SessionStorePort } from '@chrysalyst/core';
import { createFilesystemSessionStore } from '@chrysalyst/server/src/adapters/session-store/filesystem-session-store.ts';

/** The two arms this spike measures. */
export type Arm = 'arm-a' | 'arm-b';

/**
 * Builds the real filesystem session store, rooted per arm so the two arms'
 * sessions never collide on disk.
 *
 * The root comes from `CHRYSALYST_SESSION_DIR` when set, and otherwise
 * defaults to `~/.chrysalyst-spike/<arm>` — deliberately never
 * `sessionStoreConfigFromEnv`'s `~/.chrysalyst/sessions` default, so no spike
 * run can reach or corrupt the product's real session directory.
 */
export function createSpikeSessionStore<TState>(
  arm: Arm,
  env: NodeJS.ProcessEnv = process.env,
): SessionStorePort<TState> {
  const configured = env.CHRYSALYST_SESSION_DIR;
  const rootDir =
    configured === undefined || configured === ''
      ? join(homedir(), '.chrysalyst-spike', arm)
      : resolve(configured);
  return createFilesystemSessionStore<TState>({ rootDir });
}
