import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseSseFrames, type SseFrame } from './sse-frames.ts';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const fixtureText = readFileSync(
  join(repoRoot, 'tests', 'fixtures', 'interview-sse-frames.txt'),
  'utf8',
);

function referenceFrames(text: string): SseFrame[] {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map((block) => {
      const lines = block.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));
      if (eventLine === undefined || dataLine === undefined) {
        throw new Error(`fixture frame missing event or data: ${block}`);
      }
      return {
        event: eventLine.slice('event: '.length),
        data: dataLine.slice('data: '.length),
      };
    });
}

const EXPECTED_FRAMES = referenceFrames(fixtureText);

/** A partial frame with no terminating blank line — must never be yielded. */
const UNTERMINATED_TAIL = 'event: token\ndata: {"text":"incomplete';

async function* streamOf(...chunks: readonly string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
    await Promise.resolve();
  }
}

async function collect(frames: AsyncIterable<SseFrame>): Promise<SseFrame[]> {
  const collected: SseFrame[] = [];
  for await (const frame of frames) collected.push(frame);
  return collected;
}

const splitPositions = Array.from(
  { length: fixtureText.length - 1 },
  (_, index) => ({ i: index + 1 }),
);

describe('SSE frame reassembly', () => {
  it('reads four frames from the shared fixture at the repo root', () => {
    expect(EXPECTED_FRAMES.map((frame) => frame.event)).toEqual([
      'token',
      'token',
      'done',
      'error',
    ]);
  });

  it.each(splitPositions)(
    "yields the fixture's events for a split at position $i and withholds a partial frame",
    async ({ i }) => {
      const body = fixtureText + UNTERMINATED_TAIL;

      const frames = await collect(
        parseSseFrames(streamOf(body.slice(0, i), body.slice(i))),
      );

      expect(frames).toEqual(EXPECTED_FRAMES);
    },
  );

  it('yields every fixture frame when the whole body arrives in one chunk', async () => {
    const frames = await collect(parseSseFrames(streamOf(fixtureText)));

    expect(frames).toEqual(EXPECTED_FRAMES);
  });

  it('preserves the escaped newline in the decoded token and done frames', async () => {
    const frames = await collect(parseSseFrames(streamOf(fixtureText)));

    const escapedToken = frames.find(
      (frame) => frame.event === 'token' && frame.data.includes('\\n'),
    );
    const done = frames.find((frame) => frame.event === 'done');
    if (escapedToken === undefined || done === undefined) {
      throw new Error('reassembly dropped the newline-bearing frames');
    }

    expect((JSON.parse(escapedToken.data) as { text: string }).text).toContain(
      '\n',
    );
    expect((JSON.parse(done.data) as { question: string }).question).toContain(
      '\n',
    );
  });

  it('withholds trailing bytes that never complete a frame', async () => {
    const frames = await collect(
      parseSseFrames(streamOf('event: token\ndata: {"text":"no terminator"}')),
    );

    expect(frames).toEqual([]);
  });

  it('yields nothing for an empty stream', async () => {
    expect(await collect(parseSseFrames(streamOf()))).toEqual([]);
  });
});
