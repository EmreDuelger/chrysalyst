# Measurements: engine-structure-spike

Task 9. Every value below is either pulled verbatim from `measurements/arm-a.json`,
`measurements/arm-b.json`, `measurements/arm-a-session.json`, and
`measurements/arm-b-session.json` (tasks 4–8), or newly measured in this task by a
command shown inline. Nothing is estimated except axis 3, which
§ The four evaluation axes marks as extrapolation. "not obtained" is written only
where no one tried to take a metric; a stopped arm-B artifact is recorded as an
axis-1 **result**, per task 9's own instruction and § Requirements' "Arm B may end
blocked" row.

## Axis 1 — Persistence-integration effort

### LOC, concepts, session.json, failed attempts

| Metric | Arm A | Arm B |
|---|---|---|
| Non-blank, non-comment LOC of the persistence-integration module | `arm-a/turn-loop.ts` — **110** (recorded in `arm-a.json`; see LOC-integrity note below). No separate persistence module exists — direct `save`/`load` is inlined throughout the whole file, so the whole file is the measurement. | `arm-b/session-store-checkpointer.ts` — **334** (`arm-b.json`). **Result, not "not obtained": task 5 stopped under its 300-LOC stop rule.** Reached state: the artifact is complete and passes `arm-b/checkpointer.spike.test.ts` (10/10). Blocking member (verbatim): `abstract deleteThread(threadId: string): Promise<void>`. Reason: `SessionStorePort` declares `list`, `load`, `save` and no `delete`; its own doc comment states the omission is deliberate. Attempts: 1 — the gap is structural, not a failed encoding attempt (`arm-b.json`, axis-1 "BaseCheckpointSaver members that SessionStorePort cannot satisfy"). Against condition 2's 200-LOC acceptance line: 134 over. |
| Distinct concepts a reader must hold to modify it | 9, enumerated in `arm-a.json`: `SessionId`; `StoredSession<InterviewState>`; `InterviewState`/`Turn` (`AskedTurn`\|`AnsweredTurn`) and `isAnswered`; `CoreDependencies` (llm, sessions, clock); `LlmRequest`/`LlmMessage` roles; `ClockPort.now()`; `SessionStorePort.save`/`load` called directly; the async-generator streaming protocol (manual chunk accumulation via `for await`); the invariant that the asked turn is saved only after the stream's last chunk. | 15, enumerated in `arm-b.json`: `BaseCheckpointSaver` and its five abstract members; `Checkpoint` (v, id, ts, channel_values, channel_versions, versions_seen) format v4; `CheckpointTuple`; `CheckpointMetadata`; `PendingWrite`/`CheckpointPendingWrite`; `WRITES_IDX_MAP` and the negative-index rule; `SerializerProtocol.dumpsTyped`/`loadsTyped`; `thread_id`/`checkpoint_ns`/`checkpoint_id`; channel versions and uuid6 ordering; `CheckpointListOptions`; the parent chain via `parentConfig`; `SessionId`/`StoredSession<TState>`; `SessionStorePort.list`/`load`/`save` and the absence of delete; the spike-local `CheckpointArchive` shape; the read-modify-write hazard the port's whole-document `save` creates — matching the plan's own expectation almost exactly (`Checkpoint`, `CheckpointTuple`, `CheckpointMetadata`, `PendingWrite`, `serde`, `thread_id`, `checkpoint_ns`, `checkpoint_id`, channel versions all present). |
| Failed attempts before the cross-process resume worked | **0** — `live-ask.ts`/`live-answer.ts` both succeeded on the first invocation against Ollama `qwen3:8b`; the persisted `session.json` was correct on the first read-back (`arm-a.json`). | **0** — `live-ask.ts` suspended at `interrupt()` and `live-answer.ts` resumed it in a separate `node` invocation, both on the first run against `qwen3:8b`. One typecheck error preceded the run (`result.__interrupt__` is not on the state type; `isInterrupted()` + the `INTERRUPT` key is the typed route) but that was a compile failure, not a failed resume (`arm-b.json`). Proof the question came off disk, not a re-ask: `askedAt` `2026-09-11T21:19:36.226Z` (written by process 1) sits beside `answeredAt` `2026-09-11T21:19:41.201Z` (written by process 2) in the captured `session.json`. |

**LOC-integrity note.** Re-running the same counter task 4 used (`grep -cve '^\s*$' -e '^\s*//' -e '^\s*/\*' -e '^\s*\*'`) against `arm-a/turn-loop.ts` as it stands now gives **108**, not the 110 recorded in `arm-a.json`. This is a 2-line discrepancy between the recorded value and what the file measures today, most plausibly a file touched after task 4 recorded its metric (e.g. by review-fix commits) without the recorder being re-run. Recorded per the evidence rule rather than silently resolved: the axis-1 comparison below uses arm A's recorded **110** as the measurement of record (it is what task 4 actually captured and is consistent with `armAComparison` cross-references inside `arm-b.json`), with this note as the discrepancy disclosure. Command run and shown:

```
$ grep -cve '^\s*$' -e '^\s*//' -e '^\s*/\*' -e '^\s*\*' arm-a/turn-loop.ts
108
```

### The graph and resume wiring (arm B has no arm-A counterpart module — arm A's engine *is* its turn loop)

| Metric | Value |
|---|---|
| `arm-b/round-graph.ts` | 93 LOC |
| `round-graph.ts` + `live-ask.ts` + `live-answer.ts` | 160 LOC (task 6's 300-LOC stop rule; not reached — task 6 completed) |
| Arm-A comparison | `arm-a/live-ask.ts` + `arm-a/live-answer.ts` = 57 LOC; arm A needs no graph module because its turn loop is the engine |

### `session.json` — verbatim excerpts, side by side

**Arm A** — `measurements/arm-a-session.json`, 589 bytes, the entire file:

```json
{
  "schemaVersion": 1,
  "id": "6bd935da-db0d-4f27-9ede-b266f3e8b561",
  "createdAt": "2026-09-11T21:06:19.573Z",
  "updatedAt": "2026-09-11T21:06:35.538Z",
  "state": {
    "turns": [
      {
        "status": "answered",
        "question": "Can you describe the product you're thinking about and the problem it solves?",
        "askedAt": "2026-09-11T21:06:31.223Z",
        "answer": "chrysalyst turns a vague product idea into a clear, development-ready spec through a guided interview with a small local model.",
        "answeredAt": "2026-09-11T21:06:35.538Z"
      }
    ]
  }
}
```

`state` **is** `InterviewState` v1 directly — `{ turns: Turn[] }`, readable with no LangGraph knowledge.

**Arm B** — `measurements/arm-b-session.json`, 12,260 bytes total (21.8× arm A's size). Top level:

```json
{
  "schemaVersion": 1,
  "id": "61c5ce96-7f7c-4260-8242-145283aa9fcb",
  "createdAt": "2026-09-11T21:19:26.332Z",
  "updatedAt": "2026-09-11T21:19:41.235Z",
  "state": {
    "checkpoints": { "": { "<5 checkpoint ids>": { "checkpoint": {...}, "metadata": {...}, "parentCheckpointId": "..." } } },
    "writes": { "": { "<4 checkpoint ids>": { "<taskId,index>": ["taskId","channel",{"type":"json","json":...}] } } }
  }
}
```

The recoverable `InterviewState`, verbatim, at
`state.checkpoints[""]["1f1ae268-0704-6e30-8003-3daa997e99a0"].checkpoint.json.channel_values.turns`
— the checkpoint whose id sorts lexicographically last of the 5 stored:

```json
[
  {
    "status": "answered",
    "question": "Can you describe the product you're thinking about and the problem it solves?",
    "askedAt": "2026-09-11T21:19:36.226Z",
    "answer": "chrysalyst turns a vague product idea into a clear, development-ready spec through a guided interview with a small local model.",
    "answeredAt": "2026-09-11T21:19:41.201Z"
  }
]
```

That array is key-for-key identical to arm A's `state.turns` — but it sits five
levels below `state`, inside one of 5 stored checkpoints, in a document whose top
level (`checkpoints`, `writes`) is LangGraph's own channel-serialization vocabulary,
not chrysalyst's. `schemaVersion` is present and `1` for both arms — written by
`createFilesystemSessionStore` into the envelope regardless of what `state` holds,
so per § The decision rule condition 1 it discriminates nothing between the arms.

`checkpointsForOneRound`: 5. `writeRecordsForOneRound`: 11. One round already
produces 5 checkpoints and 11 write records; `session-store-checkpointer.ts`'s doc
comment states the archive "grows without bound... LangGraph appends a checkpoint
per superstep and never prunes... a session's document is rewritten in full, larger
each time, for the life of the interview" — arm A's document instead holds exactly
one `Turn` per turn, with no historical accumulation.

**Verdict against § The four evaluation axes' framing (axis 1's weighting note).**
If arm B's on-disk artefact is a LangGraph channel blob rather than an
`InterviewState`, that is a collision with `specs/mission.md`'s readable-session
promise and the `TState`-growth rationale the `On-Disk-Session-Schema` guardrail
states — **not** with that guardrail's `schemaVersion` requirement, which the
envelope satisfies for both arms. It is: `state` is a `{ checkpoints, writes }`
archive, not `{ turns: Turn[] }`.

## Axis 2 — `core` stays framework-free

**Binary: yes.** Arm B's code imports `@langchain/*` specifiers. Evidence:

```
$ grep -rl '@langchain/' arm-b/
arm-b/round-graph.ts
arm-b/session-store-checkpointer.ts
arm-b/llm-port-chat-model.ts
arm-b/live-answer.ts
arm-b/checkpointer.spike.test.ts
arm-b/record-binding-metrics.ts
arm-b/live-ask.ts
arm-b/llm-port-chat-model.spike.test.ts
arm-b/round.spike.test.ts

$ grep -rl '@langchain/' arm-a/ shared/
(no output — neither arm A nor the shared harness imports @langchain/*)
```

Engine files proper: `round-graph.ts`, `session-store-checkpointer.ts`,
`llm-port-chat-model.ts`. Entry points: `live-ask.ts`, `live-answer.ts`.
Test/measurement harness: `checkpointer.spike.test.ts`, `round.spike.test.ts`,
`llm-port-chat-model.spike.test.ts`, `record-binding-metrics.ts`. All nine files
sit under `arm-b/`, outside `packages/*`.

**Consequential.** Placing any of the three engine files in `packages/core` fails
`tests/workspace.test.ts:297` ("core declares no runtime dependencies and its
non-test source imports none") and collides with the `Kein Agent-Framework in der
Domäne` guardrail, whose status is already `fest`. Per § The decision rule
condition 5, `packages/server` is the acceptable surviving placement if the
engine's public surface stays `LlmPort`- and `SessionStorePort`-shaped; a fourth
package is not acceptable (fails the three-package invariant).

**Transitive dependency count.** The spike is one nested pnpm project with one
`package.json`; both arms share the single `spike/engine-structure/node_modules`
(no per-arm install ever happened — confirmed: `ls` shows exactly one
`node_modules/` at the spike root). A true independent "arm A's `node_modules`"
vs "arm B's `node_modules`" was therefore never installed and cannot be measured
directly, per this task's instruction to read that limitation honestly rather
than force a number the layout doesn't support. What **is** measurable
honestly is the package set attributable specifically to the four direct
`@langchain/*` dependencies and everything they pull in, walked via
`pnpm list --json --depth=Infinity` rooted at those four packages:

```
$ pnpm list --depth=0
├── @chrysalyst/core@link:../../packages/core
├── @chrysalyst/server@link:../../packages/server
├── @langchain/core@1.2.10
├── @langchain/langgraph@1.4.14
├── @langchain/langgraph-checkpoint@1.1.5
├── @langchain/ollama@1.3.0
```

4 direct `@langchain/*` dependencies. Walking their full transitive closure (deduped
by exact `name@version`) gives **25** distinct `package@version` entries total — the
4 direct packages plus 21 transitive-only additions:

```
@cfworker/json-schema@4.1.1        @langchain/protocol@0.0.19
@langchain/core@1.2.10             @standard-schema/spec@1.1.0
@langchain/langgraph-checkpoint@1.1.5   @types/json-schema@7.0.15
@langchain/langgraph-sdk@1.10.2    base64-js@1.5.1
@langchain/langgraph@1.4.14        eventemitter3@4.0.7 / @5.0.4
@langchain/ollama@1.3.0            is-network-error@1.3.2
js-tiktoken@1.0.21                 langsmith@0.10.2
mustache@4.2.0                     ollama@0.6.3
p-finally@1.0.0                    p-queue@6.6.2 / @9.3.3
p-retry@7.1.1                      p-timeout@3.2.0 / @7.0.1
whatwg-fetch@3.6.20                zod@4.6.1
```

Arm A adds **0** packages to this shared `node_modules` beyond the two
`@chrysalyst/*` links and the devDependencies (`typescript`, `vitest`,
`@types/node`) the spike's harness needs regardless of arm — confirmed by the
`grep -rl` result above (arm A imports nothing from `@langchain/*`, so nothing in
its dependency closure does either).

**`node_modules` size — combined layout, honestly recorded as such.**

```
$ du -sh node_modules
126M    node_modules
```

126M total is a combined number, not a per-arm one — the layout has no per-arm
split to measure. To give the decision a usable secondary number anyway, the
`.pnpm` store directories for exactly the 25 packages in the `@langchain/*`
closure above were summed directly (each is pnpm's own on-disk content for that
package, not a hardlink-inflated total):

```
$ du -sh --total <25 .pnpm dirs matching the @langchain/* closure>
...
61M    total
```

**61M of the 126M shared `node_modules` is attributable to arm B's `@langchain/*`
addition.** The remaining ~65M is arm A's footprint (the two `@chrysalyst/*` links)
plus the shared toolchain (`typescript`, `vitest`, `@types/node` and their own
transitive deps) that both arms' harnesses use regardless of which arm is being
measured — recorded as an attributed split rather than a true independent
before/after install, per this task's instruction to record the layout's actual
supportable precision rather than force a number it can't produce.

## Axis 3 — Question-tree and branching control for M7, M8, M13

**Extrapolation, per § The four evaluation axes — excluded from the estimate-nothing
rule, weighted last per § The decision rule.** Every answer below cites API surface
from `arm-a/turn-loop.ts` or `arm-b/round-graph.ts` / `arm-b/session-store-checkpointer.ts`
as each arm actually wrote it — never framework documentation or general impression.

**1. How is the next branch selected from the answers so far, and where does that
decision live?**

Neither arm implements branching today — M3's round is a single fixed question
(§ Non-Goals: "No second turn, no question tree, no branch selection"). What each
arm's *existing* control-flow shape implies about where a branch would have to live:

- **Arm A.** The only conditional in the whole turn loop is
  `askOpeningQuestion`'s `if (lastTurn !== undefined) { return replayStoredQuestion(...) }`
  (`turn-loop.ts`, inside `createHandRolledTurnLoop`). That `if` is an ordinary
  imperative branch inside the function body — there is no separate dispatch
  table or registry object. A future branch-selection decision would live as
  more `if`/`switch` logic inside `askOpeningQuestion` or `recordAnswer`
  themselves, mixed with the persistence calls those functions already make.
- **Arm B.** Control flow is declared, not written imperatively, as the edge
  list on the `StateGraph` builder in `createRoundGraph`: `.addEdge(START,
  'askOpeningQuestion').addEdge('askOpeningQuestion', 'awaitAnswer')
  .addEdge('awaitAnswer', 'recordAnswer').addEdge('recordAnswer', END)`
  (`round-graph.ts`). The node functions (`askOpeningQuestion`, `awaitAnswer`,
  `recordAnswer`) contain no branching logic referencing each other; "what runs
  next" lives entirely in this one edge list, separate from any node's body.

**2. Can a new branch be added without editing an existing dispatch?**

- **Arm A.** No. Adding a branch means editing the body of whichever existing
  function currently decides (`askOpeningQuestion`'s `lastTurn !== undefined`
  check, or a new check added to `recordAnswer`) — there is no dispatch object
  to extend, only function bodies to edit.
- **Arm B.** Partially. `StateGraph` exposes `.addConditionalEdges(...)` as an
  additive call on the same builder chain used in `createRoundGraph` — a new
  branch is a new call on the chain, and no existing node function
  (`askOpeningQuestion`, `awaitAnswer`, `recordAnswer`) needs editing. The
  qualifier: the builder chain itself (`createRoundGraph`'s `return new
  StateGraph(...)....compile(...)`) is one expression that a new
  `.addConditionalEdges` call is inserted into, so it is not edit-free in the
  strictest sense — but the four existing `.addEdge` calls and all three node
  bodies are untouched by the insertion, which is the meaningful difference
  from arm A's shape.

**3. How does M13's clarification follow-up re-enter an earlier point in the
conversation?**

Neither arm builds this; M13 is a later milestone. What each arm's actually-built
persistence contract would have to support:

- **Arm A.** Every read goes through `deps.sessions.load(id)` and then
  `session.state.turns.at(-1)` — `askOpeningQuestion` and `recordAnswer` both
  address only the most recent turn (`turn-loop.ts`). `SessionStorePort.save`
  replaces the whole document each time; nothing about an earlier turn is kept
  once a later one is saved. Re-entering an earlier point would require
  every function currently written against "the last turn" to be rewritten
  against "turn at index N."
- **Arm B.** `session-store-checkpointer.ts`'s doc comment for `getTuple`
  states: "With no `checkpoint_id` in the config it takes the
  lexicographically largest id in the namespace" — i.e. `getTuple` is written
  to accept an explicit `checkpoint_id` and is only defaulting to "latest"
  when one isn't given. Because the archive keeps all 5 checkpoints from one
  round rather than overwriting them, addressing an arbitrary earlier
  `checkpoint_id` is a capability the checkpointer already has a code path
  for, even though task 6's graph never calls it that way. Arm A's document
  has no equivalent: once `save` replaces it, only the current `turns` array
  survives.

**4. What does M8's multi-turn loop look like, and what does it do to the
persisted shape?**

- **Arm A.** `turn-loop.ts` already persists `turns` as an array and both
  `askOpeningQuestion` (`state: { turns: [...turnsSoFar, asked] }`) and
  `recordAnswer` (`state: { turns: [...session.state.turns.slice(0, -1),
  answered] }`) already append/replace by slicing the array. A second turn is
  the same `begin`/`ask`/`record` cycle repeated, appending one more `Turn`
  to the same array — the persisted shape (`{ turns: Turn[] }`) needs no
  change to hold N turns instead of one.
- **Arm B.** A loop requires a new conditional edge from `recordAnswer` back
  to `askOpeningQuestion` instead of always to `END` (`round-graph.ts`'s
  current `.addEdge('recordAnswer', END)`). Per `arm-b.json`'s recorded
  numbers, one round already produces 5 checkpoints and 11 write records, and
  `session-store-checkpointer.ts`'s doc comment states the archive "grows
  without bound... never prunes... rewritten in full, larger each time." An
  M-turn interview under arm B's persisted shape would carry roughly `5×M`
  checkpoints and `11×M` write records inside one ever-growing document,
  against arm A's document staying at exactly `M` `Turn` objects in one array.

**Probe verdict against § The decision rule condition 6.** Probes 1 and 2 favour
`StateGraph` (control flow is declared and separately extensible from node
bodies, citing real code). Probes 3 and 4 favour arm A once the persisted-shape
consequence is counted (constant-size document vs. an archive that grows
without bound per the checkpointer's own doc comment) — condition 6 does not
decide alone regardless of the split, per § The decision rule.

## Axis 4 — `TState` ownership, testability, dependency weight

| Metric | Arm A | Arm B |
|---|---|---|
| Does a hermetic round run with no Ollama? | **Yes** — `turn-loop.ts` runs unchanged against the shared fake `LlmPort`; the only cost was the harness itself (mkdtemp store + `createScriptedLlm`), no arm-A-specific test seam was added to `turn-loop.ts` (`arm-a.json`). | **Achievable via the task-7 `LlmPortChatModel` binding, at 70 LOC** — no LangChain test double needed. `arm-b/binding-drives-node.check.ts` and `arm-b/round.spike.test.ts` run the whole round, `interrupt()` and the cross-invocation resume, against a mkdtemp store with no daemon and no network, collected by `pnpm vitest run arm-b` (`arm-b.json`). |
| Who owns the persisted shape | `InterviewState` v1 — `state` **is** `{ turns: Turn[] }` directly (see axis-1 excerpt above). | LangGraph's channel serialization — `state` is `{ checkpoints, writes }`, a `CheckpointArchive`; `InterviewState` is recoverable as a value nested 5 levels inside it, not as the document's own shape (`session-store-checkpointer.ts` doc comment: "The only shape that fits a one-document-per-session port is therefore the entire per-thread checkpoint store, serialized into `state` as `CheckpointArchive`"). |
| Can arm B keep `InterviewState` v1 as the on-disk shape at all? | n/a (it already is) | **No, not as the top-level on-disk shape.** `session-store-checkpointer.ts`'s doc comment states this is "the central finding": `SessionStorePort` addresses one whole-document-per-`SessionId` slot, replaced whole on every `save`; LangGraph needs a keyed, growing collection (many checkpoints × many `checkpoint_ns`, each with metadata, parent pointer, and pending writes). The mechanism that recovers `InterviewState` — reading `channel_values.turns` off the lexicographically-latest checkpoint — works, but it operates on a value nested inside the archive, not on `state` itself. This is the axis-4 gate: § The decision rule condition 1 requires `state` itself to round-trip as `InterviewState` v1, and it does not. |
| Direct and transitive package count added | **0** — confirmed by axis 2's `grep -rl '@langchain/' arm-a/ shared/` returning no files; arm A draws only on the two `@chrysalyst/*` links and the harness's shared devDependencies. | **25** distinct `package@version` entries (4 direct `@langchain/*` packages + 21 transitive-only additions), measured in axis 2 via `pnpm list --json --depth=Infinity` rooted at the 4 direct packages. |
| Chat-model binding cost | n/a — arm A calls `LlmPort` directly, no binding layer exists | Two bindings measured per § Arm B's chat-model binding: `ChatOllama` from `@langchain/ollama` — **4 LOC** (a `new ChatOllama({ baseUrl, model })` literal in each entry point), completed first attempt, but bypasses `LlmPort` entirely (needs its own `CHRYSALYST_OLLAMA_URL`, production would carry two independently configured LLM clients). `arm-b/llm-port-chat-model.ts`'s guardrail-compliant `BaseChatModel` subclass over `LlmPort` — **70 LOC** against a 200-LOC ceiling, completed, no `@langchain/core` internal reached beyond the documented abstract surface (`_llmType`, `_generate`, the optional `_streamResponseChunks` override); proven sufficient by driving the whole task-6 graph, its `interrupt()`, and its resume through it with no Ollama (`arm-b.json`). |

## Cross-reference to § The decision rule

This file records measured values only; task 10 weighs them. Flagged here because
it follows directly from the rows above: § The decision rule condition 1 (axis 4,
gate) requires `state` to round-trip as `InterviewState` v1 without LangGraph, and
the "Can arm B keep `InterviewState` v1 as the on-disk shape at all?" row above
answers **no** — `state` is a `CheckpointArchive`, and the guardrail's own text says
a LangGraph channel blob under `state` "ends the case regardless of every other
number." Condition 2 (axis 1) is independently also failed: task 5 stopped at
334 LOC against a 200-LOC acceptance line (see the LOC table above), citing
`deleteThread` as the blocking member. Both are task 10's decision to write up;
recorded here only as the pointer from measurement to the condition it feeds.
