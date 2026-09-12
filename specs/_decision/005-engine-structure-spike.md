# Decisions: engine-structure-spike

## ADR: The M3 interview engine is a hand-rolled turn loop over direct `SessionStorePort` access, not LangGraph.js

**ID:** engine-structure-handrolled
**Plan:** engine-structure-spike
**Status:** Accepted

### Context

`specs/roadmap.md` § Technische Leitplanken carried one open guardrail: "Hand-gerollter Zustandsautomat **oder** LangGraph.js in `core`," to be decided by a Wegwerf-Spike in M3 focused on persistence-integration cost — `SessionStorePort` versus a LangGraph checkpointer. M7 (question tree), M8 (turn loop), M9 (spec-state model), and M13 (clarification follow-up) all build on whichever structure this ADR names.

This spike built the M3 round twice — arm A over a hand-rolled turn loop with direct `SessionStorePort.save`/`load`, arm B over LangGraph.js `interrupt()` with a hand-written `SessionStorePort`-backed `BaseCheckpointSaver` — ran both against a real `qwen3:8b` model across a real process boundary, and measured four axes into `measurements/comparison.md`. § The decision rule in `plan.md` states the six conditions below, written before any spike code existed, and the weighting: axis 2 and the axis-4 persisted-shape question are gates; axis 1 is primary; the rest of axis 4 is secondary; axis 3 is extrapolation and decides last.

### Decision

**Hand-rolled, on two independent grounds, either of which alone is sufficient.**

Citing § The decision rule by name, condition by condition, against `measurements/comparison.md`:

| # | Condition | Threshold / acceptance line | Measured value | Verdict |
|---|---|---|---|---|
| 1 | Axis 4, gate — `state` round-trips as `InterviewState` v1, readable with no LangGraph | `session.json`'s `state` field **is** `{ turns: Turn[] }` | Arm B's `state` is `{ checkpoints, writes }` — LangGraph's own channel-serialization vocabulary. `InterviewState` is recoverable only as a value nested five levels inside one of five stored checkpoints (`state.checkpoints[""][<id>].checkpoint.json.channel_values.turns`), not as `state` itself. Arm A's `state` **is** `{ turns: Turn[] }` directly | **FAIL** |
| 2 | Axis 1 — checkpointer + `thread_id`→`SessionId` mapping at or under 200 non-blank non-comment LOC, cross-process resume works | ≤ 200 LOC | `session-store-checkpointer.ts` reached **334 LOC**, tripping task 5's 300-LOC stop rule (134 over the 200-LOC acceptance line). Blocking member: `abstract deleteThread(threadId: string): Promise<void>` — `SessionStorePort` declares `list`/`load`/`save` and, by its own doc comment, deliberately no `delete`. One attempt; the gap is structural, not a failed encoding | **FAIL** |
| 3 | Axis 4 — guardrail-compliant `BaseChatModel` binding at or under 200 LOC | ≤ 200 LOC | 70 LOC, completed first attempt, no undocumented `@langchain/core` internals reached | PASS |
| 4 | Axis 4 — hermetic arm-B round achievable with no Ollama | a route exists | Achievable via the task-7 `LlmPortChatModel` binding at the same 70 LOC; `round.spike.test.ts` runs the whole round including `interrupt()`/resume against a `mkdtemp` store, no daemon, no network | PASS |
| 5 | Axis 2, gate — a `@langchain/*`-importing engine has an acceptable placement | `packages/server` acceptable if the engine's public surface stays `LlmPort`-/`SessionStorePort`-shaped; a fourth package is not | `packages/server` names an acceptable placement under that shape; arm B's engine code (`round-graph.ts`, `session-store-checkpointer.ts`, `llm-port-chat-model.ts`) never needed to sit in `packages/core` | PASS |
| 6 | Axis 3 — the four branching probes favour `StateGraph` | last, does not decide alone | Split: probes 1–2 (branch selection, additive dispatch) favour `StateGraph`'s declared edge list; probes 3–4 (clarification re-entry, multi-turn persisted-shape growth) favour arm A, whose document stays exactly `M` `Turn` objects against arm B's ~5×M checkpoints and ~11×M write records per M turns | mixed, not decisive |

Per § The decision rule: **"The note recommends hand-rolled if any one of conditions 1 through 5 fails."** Conditions 1 and 2 both fail, independently, for different and unrelated reasons — condition 1 on what the persisted document *is*, condition 2 on what building it *cost*. Either failure alone ends the case; both failing together leaves no route to a LangGraph recommendation regardless of condition 6's split verdict. § The decision rule's "blocked arm B is decided by condition 2" paragraph applies to condition 2's failure (task 5's stop), and independently condition 1 was measured directly from arm B's completed `session.json` — it is not one of the "not measured: arm B stopped" cases; both conditions have real, cited values, not gaps.

**The rejected option's strongest case**, stated fairly per § This is a throwaway spike: LangGraph.js wins outright on axis 2 (never a `packages/core` concern — condition 5 passes) and on axis 4's chat-model binding and hermetic-testability sub-questions (conditions 3 and 4 both pass at a cheap 70 LOC), and on half of axis 3 — its `StateGraph` edge list gives branch selection a declared, additively-extensible home that arm A's imperative `if` inside `askOpeningQuestion` does not. If M7's question tree turns out to need many conditional branches added over time without touching existing node bodies, that is the concrete capability this ADR gives up. What decides against it regardless is narrower and structural: `SessionStorePort` is a one-document-per-session port with no `delete`, and `BaseCheckpointSaver` needs a keyed, growing, prunable collection — the port and the checkpointer contract are not the same shape, and closing that gap cost more LOC than the budget allowed while still leaving the on-disk document unreadable as `InterviewState` without LangGraph.

No collision with `Kein Agent-Framework in der Domäne` to name — that guardrail's clause in § Impact applies only if the recommendation is LangGraph.js, and it is not.

### Options Considered

| Option | Axis 1 (persistence) | Axis 2 (framework-free) | Axis 3 (branching, extrapolated) | Axis 4 (ownership/testability) | Recommended |
|---|---|---|---|---|---|
| Hand-rolled turn loop, direct `SessionStorePort.save`/`load` | ✓ 110 LOC, 0 failed attempts, `state` is `InterviewState` v1 directly | ✓ imports nothing from `@langchain/*`; lives in `packages/core` as today | ✗ new branches edit `askOpeningQuestion`/`recordAnswer` bodies directly; ✓ constant-size persisted document as turns grow | ✓ hermetic today via the shared fake `LlmPort`, no binding layer, `InterviewState` v1 owned outright | **✓ Yes** |
| LangGraph.js `interrupt()` + `SessionStorePort`-backed `BaseCheckpointSaver` | ✗ checkpointer 334 LOC (over 300-LOC stop rule, 134 over the 200-LOC line), blocked on `deleteThread`; `state` is a `CheckpointArchive`, not `InterviewState` v1 | ✓ (if placed in `packages/server`) but 25 transitive `@langchain/*` packages, 61M of `node_modules` | ✓ new branches are additive `.addConditionalEdges` calls; ✗ archive grows ~5×M checkpoints / ~11×M writes per M turns, unbounded | ✓ hermetic via the 70-LOC `LlmPortChatModel` binding; ✗ does not own `InterviewState` v1 as the on-disk shape | ✗ No |

### Consequences

**M7** builds the question tree as a hand-rolled data structure over `SessionStorePort`, addressed through `InterviewState`'s existing `{ turns: Turn[] }` shape (grown as M7 requires) — not as a `StateGraph`. Branch selection is written as explicit dispatch logic in `core`, following arm A's pattern of a conditional inside the function that already owns the decision (e.g. `askOpeningQuestion`'s `lastTurn !== undefined` check); M7 should budget for this being less additively extensible than `StateGraph`'s edge list would have been (condition 6's probe-1/2 finding), and should consider an explicit dispatch table if the tree grows past a handful of branches, rather than accreting further `if`/`switch` nesting.

**M8** builds the multi-turn loop as repeated `begin`/`ask`/`record` cycles appending to the same `turns` array, exactly as arm A already demonstrated scales with no shape change — `InterviewState` v1's `{ turns: Turn[] }` needs no redesign to hold N turns instead of one.

**M13** builds the clarification follow-up needing to re-enter an earlier point in the conversation. Arm A's demonstrated shape addresses only the last turn (`session.state.turns.at(-1)`) and replaces the whole document on save; re-entering turn *N* (not just the latest) is a capability M13 must add deliberately — for example, indexing into `turns` by position rather than always taking the tail — since it is not free the way it would have been under LangGraph's checkpoint-by-`checkpoint_id` addressing (condition 6's probe-3 finding). This is the one concrete piece of headroom this ADR gives up in exchange for a readable, constant-size on-disk session and a synchronous 200-LOC-cheaper integration.

**The `Kein Agent-Framework in der Domäne` guardrail needs no revisit** — the interview engine stays hand-written in `packages/core`, unchanged from its current status.

**Reachability.** The spike's code is preserved at tag `spike/engine-structure-m3` on branch `spike/engine-structure`, never merged to `main`. Re-deriving any of the measured numbers above starts there.
