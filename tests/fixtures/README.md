# tests/fixtures

## `interview-sse-frames.txt`

Literal Server-Sent Events bytes for the `interview/interview-http-api` contract:
three event types (`token` / `done` / `error`), each `data` a single line of JSON,
no `id:` field. Each frame ends with a blank line. The file lives at the repo root
so `packages/server` and `packages/web` tests both read it with `node:fs` from a
path resolved against the repo root — no package edge.

The file holds **four frames as two segments**, because no single correct response
carries all four:

- **Segment 1 — happy-path body (frames 1–3):**
  1. `event: token` — `{"text":"What problem does your product solve,\n"}`
  2. `event: token` — `{"text":"and what do people do about it today?"}` (the escaped
     `\n` in frame 1 exercises `JSON.stringify` newline escaping)
  3. `event: done` — `{"question":"What problem does your product solve,\nand what do people do about it today?"}`

  The `done` payload's `question` is the **byte-exact concatenation** of frames 1
  and 2's `text` fields.

- **Segment 2 — failing-model tail (frame 4):** 4. `event: error` — `{"message":"Cannot reach the language model at http://127.0.0.1:11434/v1"}`

  This `message` is **canonical**: it is exactly what task 9's failing-model double
  raises, in the adapter's error style from `002-add-ollama-llm-adapter`
  (`Cannot reach the language model at <baseUrl>`).

### Who reads it

- **Task 9** (`packages/server` route contract): asserts the question route emits
  segment 1 byte-for-byte on the happy path, and emits the 4th frame as the last
  frame of a failing-model response. Its model double is scripted from frames 1–2's
  `text` payloads; its failing double raises frame 4's `message` verbatim.
- **Task 13** (`packages/web` SSE parser): feeds all four frames to the parser at
  every split position, expecting the same four events back each time, with the
  escaped newline intact.

Renaming an event name or a payload field on either side (`text`, `question`,
`message`) fails a run rather than only a browser.
