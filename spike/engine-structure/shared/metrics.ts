import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Arm } from './store.ts';

const MEASUREMENTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'measurements',
);
const ABSENT_CODE = 'ENOENT';

/** One recorded fact from plan.md's § The four evaluation axes. */
export interface Measurement {
  readonly axis: number;
  readonly metric: string;
  readonly value: unknown;
}

/**
 * Appends one measurement to `measurements/<arm>.json`, so a number produced
 * mid-run survives the process that produced it — the note is written in a
 * later task, possibly a later session, and a number that exists only in
 * scrollback is not evidence.
 */
export async function recordMeasurement(
  arm: Arm,
  measurement: Measurement,
): Promise<void> {
  await mkdir(MEASUREMENTS_DIR, { recursive: true });
  const path = join(MEASUREMENTS_DIR, `${arm}.json`);
  const existing = await readRecorded(path);
  await writeFile(
    path,
    `${JSON.stringify([...existing, measurement], null, 2)}\n`,
    'utf8',
  );
}

async function readRecorded(path: string): Promise<readonly Measurement[]> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Measurement[];
  } catch (error) {
    if (errorCodeOf(error) === ABSENT_CODE) {
      return [];
    }
    throw error;
  }
}

function errorCodeOf(error: unknown): string | undefined {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return undefined;
}
