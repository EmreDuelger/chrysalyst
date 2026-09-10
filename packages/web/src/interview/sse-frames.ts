/**
 * One reassembled Server-Sent Events frame: the `event:` name and the raw,
 * still-encoded `data:` payload.
 */
export interface SseFrame {
  readonly event: string;
  readonly data: string;
}

const FRAME_SEPARATOR = '\n\n';
const LINE_SEPARATOR = '\n';
const EVENT_FIELD = 'event: ';
const DATA_FIELD = 'data: ';

function decodeFrame(block: string): SseFrame | undefined {
  const lines = block.split(LINE_SEPARATOR);
  const eventLine = lines.find((line) => line.startsWith(EVENT_FIELD));
  const dataLine = lines.find((line) => line.startsWith(DATA_FIELD));
  if (eventLine === undefined || dataLine === undefined) {
    return undefined;
  }
  return {
    event: eventLine.slice(EVENT_FIELD.length),
    data: dataLine.slice(DATA_FIELD.length),
  };
}

/**
 * Reassembles arbitrarily split stream text into whole SSE frames.
 *
 * A chunk boundary falls anywhere — inside an event name, inside a payload, or
 * between the two newlines that end a frame — so the only text a chunk can be
 * trusted to complete is whatever precedes its last blank line. Splitting the
 * accumulated text on that separator and holding the final part back for the
 * next chunk makes the promise structural rather than a special case: a frame
 * is yielded once its terminating blank line has arrived and never before, and
 * a trailing partial frame the stream never finishes is dropped instead of
 * yielded, because the held part is only ever prepended, never emitted. Frames
 * are LF-terminated, which is what `interview/interview-http-api` puts on the
 * wire; a lone CR is payload, not a line ending. A block carrying neither
 * field — a comment, or the empty block consecutive separators leave behind —
 * is not an event and is skipped, so one odd block cannot tear down a live
 * question stream.
 *
 * `data` stays byte-for-byte as it arrived. Decoding it into one of the three
 * wire payloads belongs to `interview-api.ts`, which keeps this module
 * ignorant of the wire shapes and lets it be checked at every byte boundary of
 * `tests/fixtures/interview-sse-frames.txt` against nothing but string
 * identity — including an escaped newline inside a payload, which is exactly
 * the byte pair that must not be mistaken for a frame boundary.
 */
export async function* parseSseFrames(
  chunks: AsyncIterable<string>,
): AsyncIterable<SseFrame> {
  let held = '';
  for await (const chunk of chunks) {
    const blocks = (held + chunk).split(FRAME_SEPARATOR);
    held = blocks.pop() ?? '';
    for (const block of blocks) {
      const frame = decodeFrame(block);
      if (frame !== undefined) {
        yield frame;
      }
    }
  }
}
