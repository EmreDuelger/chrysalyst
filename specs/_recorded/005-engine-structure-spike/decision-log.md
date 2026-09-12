# Decision Log: engine-structure-spike

## Interview

**Q:** How does a throwaway spike pass through the speq flow — full standard route, or an abbreviated one?
**A:** Full standard route (`/speq:plan` → `/speq:implement` → `/speq:record`), but spike-shaped. No permanent feature-spec deltas. `plan.md` explicitly carries the evaluation criteria and a Non-Goal stating that spike code is discarded. `/speq:record` promotes ONLY the ADR to `specs/_decision/005-engine-structure-spike.md`, archives the plan to `specs/_recorded/`, and merges no feature specs. Adversarial plan-review and code-review stay part of the flow. `/speq:record` sets `specs/roadmap.md` § M3 to ✅ — both M3 plans are then done — and updates the "Engine-Struktur" guardrail row.

**Q:** Does the spike code land on `main`, or only the note?
**A:** Spike code lives on branch `spike/engine-structure` and is NEVER merged to `main` — a draft PR or just a branch link recorded in the ADR — then tagged for reference. Only the ADR, the archived plan, and the roadmap status bump reach `main`. `tests/workspace.test.ts` stays UNTOUCHED, both the exactly-three-packages guard and the `packages/core` non-relative-import scan: the LangGraph.js arm must not make `packages/core` depend on it.

**Q:** What is the scope of each spike arm?
**A:** Exactly the M3 round, twice. One cold opening question (hardcoded English prompt, same intent as `packages/core/src/interview`'s `OPENING_SYSTEM_PROMPT` today), one user answer, persisted. Arm A: hand-rolled turn loop, direct `SessionStorePort.save`/`load` between question and answer. Arm B: LangGraph.js `interrupt()` after the question plus a `SessionStorePort`-backed `BaseCheckpointSaver`, answer supplied via `Command({ resume })`, re-invoked with the same `thread_id` in `configurable`. One interrupt/resume cycle. Focus: persistence-integration cost.

**Q:** Does the spike make the M7 decision, or only present evidence for a later one?
**A:** Recommendation plus ADR "Accepted". The spike picks one structure — hand-rolled or LangGraph.js — and justifies it. `specs/_decision/005-engine-structure-spike.md` is recorded with Status "Accepted"; M7 just executes it. The "Engine-Struktur" guardrail goes to "fest".

**Q:** How far through the stack does the spike harness reach?
**A:** Core round plus persistence only. A standalone script or Vitest harness inside the `spike/` directory drives begin → stream question → persist → process boundary → resume → answer → persist, against real Ollama (`qwen3:8b` via the `CHRYSALYST_LLM_MODEL` convention). No SSE route, no browser, no HTTP.

**Q:** Where does the hand-rolled comparison arm live?
**A:** Freshly implemented inside `spike/engine-structure/`, self-contained, top-level and outside `packages/*` — the `pnpm-workspace.yaml` glob is `packages/*`, so the workspace guard is untouched. Arm A adapts the existing `createSingleTurnInterview` logic into the spike. `packages/core` stays completely untouched.

**Q:** Which dimensions decide the note?
**A:** No preference expressed; all four proposed axes are used. (1) Persistence-integration effort — LOC and concepts: direct `SessionStorePort.save`/`load` versus a custom `BaseCheckpointSaver` over `SessionStorePort`; the core focus per the roadmap. (2) `core` stays framework-free — LangGraph.js in `core` breaks the "no agent framework in the domain" guardrail and the workspace import scan, so the engine would have to move to `server` or a new layer; name the architectural cost. (3) Question-tree and branching control for M7/M8 — deterministic hand-rolled graph versus LangGraph `StateGraph`: control over adaptive branch selection (Capability 1), the multi-turn loop (M8), clarification follow-ups (M13). (4) `TState` ownership and testability — hand-rolled keeps `InterviewState` v1 and hermetic fake-LLM tests; LangGraph owns the checkpoint serialization format and brings `@langchain/*` dependency weight plus an Ollama chat-model binding.

## Design Decisions

### [1] The plan carries no spec delta at all

- **Decision:** `specs/_plans/engine-structure-spike/` holds `plan.md` and `decision-log.md` and no spec file, spike-local or otherwise. `plan.md` § Features reads "None".
- **Alternatives:** A spike-local spec marked non-merging, written purely so the plan would validate against something, with `/speq:record` instructed to skip it.
- **Rationale:** `speq plan validate` was probed against a plan directory holding only a `plan.md` before this plan was authored. It passed and printed `Note: No delta specs found in plan`. The validator does not require a delta, so a spec file would exist only to be skipped — a rule for `/speq:record` to get wrong, buying nothing. `plan.md` states that the note is the expected validator output so a later reader does not read it as a defect.
- **Promotes to ADR:** no

### [2] The spike branch is never merged; the note travels to `main` as a file copy

- **Decision:** All spike work lives on `spike/engine-structure`. Its last commit is tagged `spike/engine-structure-m3` and the tag is pushed. The decision note and verification report are then copied onto a branch cut from `main`, verified with `git diff --stat` to touch only `specs/`, and recorded from there.
- **Alternatives:** Merging the spike branch; leaving a draft PR open indefinitely as the archive; squash-merging only the note commit.
- **Rationale:** Set by the user. A file copy makes "no spike code reached `main`" checkable with one command rather than trusted, and a squash-merge of a single commit off a branch that also carries spike code is exactly the operation that leaks by accident. The tag keeps the code readable after the branch is deleted, which is what the ADR's pointer needs — a branch link alone goes stale the moment someone tidies branches.
- **Promotes to ADR:** no

### [3] The spike lives outside `packages/*`, in its own nested pnpm project

- **Decision:** `spike/engine-structure/` is a top-level directory with its own `pnpm-workspace.yaml` declaring `packages: []`, its own `package.json`, its own lockfile, its own `tsconfig.json`, and its own `vitest.config.ts`. It links `@chrysalyst/core` and `@chrysalyst/server` with `link:`.
- **Alternatives:** A fourth workspace package; a sibling repository; a scratch directory outside the repository entirely.
- **Rationale:** The `packages/*` glob and `tests/workspace.test.ts`'s `enumerates exactly the three workspace packages` are what a fourth package would break, and the user named both as untouchable. A sibling repository cannot link `@chrysalyst/core` and leaves the ADR pointing at code outside the repository's history. The nested `pnpm-workspace.yaml` is the mechanism that stops `pnpm install` inside the spike from walking up to the repository lockfile, which is what keeps `@langchain/*` out of it. Task 1 proves the isolation held before any later task runs.
- **Promotes to ADR:** no

### [4] No file under `spike/` may be named `*.live.test.ts`

- **Decision:** Spike harness files carry the suffix `*.spike.test.ts`.
- **Alternatives:** Reusing `*.live.test.ts` for consistency with `packages/`; editing `tests/workspace.test.ts` to exclude `spike/` from its scan.
- **Rationale:** `tests/workspace.test.ts:191` reads `filesUnder('', (name) => name.endsWith('.live.test.ts'))`, and `filesUnder('')` walks the whole repository skipping only `node_modules`, `dist`, `coverage`, and dot-directories. A spike file with that suffix would be pulled into the `CHRYSALYST_LIVE_LLM` gate assertions, forcing either an edit to the invariant test — which the user forbade — or a convention the spike has no reason to follow. Renaming is the smaller move by a wide margin, and it is why `tests/workspace.test.ts` can be both untouched and green on the spike branch.
- **Promotes to ADR:** no

### [5] Both arms link the real packages rather than vendoring copies

- **Decision:** `@chrysalyst/core` and `@chrysalyst/server` are linked, so both arms drive the real `SessionStorePort`, the real `createFilesystemSessionStore`, and the real `createOpenAiCompatibleLlm`. Vendoring exactly two adapter files is a bounded fallback if the deep-path import does not resolve, and needing it is itself recorded.
- **Alternatives:** Vendoring the port declaration and a simplified store into the spike from the start, as "self-contained" could be read to require.
- **Rationale:** Axis 1 asks what integrating with *this* `SessionStorePort` costs. Measured against a simplified copy it would answer an easier question, and the flattery would fall entirely on arm B, whose whole difficulty is that a real port shape has to be reshaped into a checkpointer contract. Linking also keeps `packages/` read-only in the strongest sense: the spike consumes it and cannot edit it. "Self-contained" is honoured where it matters — no `packages/` file changes and no repository dependency is added.
- **Promotes to ADR:** no

### [6] Arm B builds two chat-model bindings, and `@langchain/openai` is excluded outright

- **Decision:** Arm B binds the model twice — `ChatOllama` from `@langchain/ollama` as the cheap baseline, and a minimal custom `BaseChatModel` over the existing `LlmPort` as the guardrail-compliant path. Both are measured. `@langchain/openai` is not built.
- **Alternatives:** `ChatOllama` alone; `@langchain/openai` pointed at Ollama's OpenAI-compatible endpoint, as the pre-planning research suggested; the custom `BaseChatModel` alone.
- **Rationale:** A LangGraph node cannot call `LlmPort`, so the binding is not incidental — it is where most of LangGraph's real integration cost lands, and hiding it would corrupt axis 4. `ChatOllama` alone measures a path production cannot take: it abandons `LlmPort` and leaves two parallel LLM integrations beside the Vercel AI SDK adapter the `LlmPort`-Adapter guardrail already fixed. The custom binding alone hides how much of arm B's cost is binding rather than graph work. `@langchain/openai` is excluded because it carries the `openai` SDK and the `Kein Cloud-LLM-SDK` guardrail is already `fest` — measuring an option the decision cannot use would waste the arm's most expensive task.
- **Promotes to ADR:** no

### [7] The custom `BaseChatModel` is bounded and may be abandoned mid-task

- **Decision:** Task 7 stops and records the reached state if the binding exceeds 200 non-blank non-comment LOC or requires reaching into `@langchain/core` internals beyond the documented abstract members.
- **Alternatives:** Implementing it to completion however long it takes; skipping it and estimating its cost in the note.
- **Rationale:** The abandonment point *is* the measurement — a binding that cannot be written inside that budget has already answered whether LangGraph can enter this codebase without a second LLM integration. Pushing past it spends real effort on code with a scheduled deletion date. Estimating instead would put a guess where the spike's single hardest number belongs, which is the failure mode the whole plan is built to avoid.
- **Promotes to ADR:** no

### [8] Four axes, each with a stated metric, and nothing estimated

- **Decision:** The note is decided on persistence-integration effort, `core` staying framework-free, branching control for M7/M8/M13, and `TState` ownership plus testability. Each axis names its metric in `plan.md`; task 9 records values into `measurements/comparison.md`; a metric that could not be obtained is written "not obtained" with a reason.
- **Alternatives:** The roadmap's single stated focus, persistence integration, alone; an open-ended qualitative write-up.
- **Rationale:** The user accepted all four. Persistence alone would miss the finding most likely to decide the outcome — that LangGraph in `core` collides with a guardrail already marked `fest` — which is an architectural cost no LOC count surfaces. Axis 3 cannot be measured by one round, so it is explicitly an extrapolation that must cite concrete API surface from the code each arm produced, which is the discipline that keeps it from becoming an impression. The "estimate nothing" rule exists because an estimate in a comparison table is indistinguishable from a measurement once the table is read at M7.
- **Promotes to ADR:** no

### [9] The ADR records as "Accepted", not "Proposed"

- **Decision:** `specs/_decision/005-engine-structure-spike.md` carries Status `Accepted` and one recommendation. The "Engine-Struktur" guardrail moves from `offen` to `fest`.
- **Alternatives:** Status `Proposed`, with the decision confirmed at M7 when the question tree's requirements exist.
- **Rationale:** Set by the user. A `Proposed` ADR re-runs this investigation at M7 against a deadline, which is precisely the outcome the roadmap guardrail was written to prevent; the evidence is never fresher than the moment both arms have just been built and run. The note is still required to state the rejected option's strongest case, so a future reversal has the counter-argument in hand rather than needing to reconstruct it.
- **Promotes to ADR:** no

### [10] The harness stops at the core round plus persistence

- **Decision:** No HTTP route, no SSE, no browser. Two `node` entry points per arm, separated by a real process boundary, over the real filesystem store.
- **Alternatives:** Driving the full HTTP and SSE path both arms would sit behind, as `004-single-question-walking-skeleton`'s live tier does.
- **Rationale:** Set by the user. The SSE contract was settled by `004` and is identical for both arms, so it adds no discriminating evidence while doubling the harness that gets thrown away. The process boundary is kept because it is the one part of the delivery path that *is* discriminating: a single-process resume would let in-memory state carry the answer and would prove nothing about either persistence layer.
- **Promotes to ADR:** no

### [11] `spike/**` is added to the root ESLint ignores and `.prettierignore`, on the branch only

- **Decision:** `eslint.config.js` gains `'spike/**'` in its `ignores` array and `.prettierignore` gains `spike/`. Both edits live on `spike/engine-structure` and are never merged; `plan.md` § Dead Code Removal lists them as branch-only.
- **Alternatives:** Giving the spike a TypeScript project the root ESLint config can type-check; leaving the root checklist failing on the spike branch.
- **Rationale:** `pnpm lint` runs `eslint .` and `pnpm format:check` runs `prettier --check .`; both reach `spike/`, and `strictTypeChecked` would then demand the spike files belong to a TypeScript project they are deliberately outside of. The root checklist must stay green on the spike branch because that green run is the evidence `packages/` was not touched — a failing checklist would destroy the plan's main isolation proof. Holding throwaway code to `strictTypeChecked` spends real effort on code with a scheduled deletion date.
- **Promotes to ADR:** no

### [12] Both arms are finished before either is judged

- **Decision:** Task 9 runs only after Groups B and C are both complete; the note is task 10, after task 9.
- **Alternatives:** Writing each arm's section of the note as that arm finishes.
- **Rationale:** Judging a finished arm against an imagined one is how spikes ratify the conclusion their author already held. Separating measurement (task 9) from recommendation (task 10) means the comparison table exists as a checkable artefact before anything argues from it, and `measurements/` persists to a file rather than to scrollback because the note may be written in a later session.
- **Promotes to ADR:** no

## Review Findings

### [13] [plan-review] Four procedural decisions would have been promoted alongside the note

- **Finding:** `[INTENT_DRIFT]`, round 1. The user's interview answer is that `/speq:record` promotes ONLY the ADR to `specs/_decision/005-engine-structure-spike.md`, and `plan.md` § Impact restated it as "Promote exactly one decision". But this log flagged four entries for ADR promotion — [1] no spec delta, [2] the branch is never merged, [6] two chat-model bindings, [9] Status `Accepted`. That flag is the repository's established promotion mechanism: `specs/_recorded/004-single-question-walking-skeleton/decision-log.md` carries nine `yes` flags and `specs/_decision/004-single-question-walking-skeleton.md` carries seven `## ADR:` sections. `recorder-agent` reads the log, not the prose, so the 005 file would have opened with four sections of spike bookkeeping around the one decision the roadmap guardrail points at.
- **Direction change:** Entries [1], [2], [6], and [9] now decline promotion on their own promotion line, and no entry in this log elects it. `plan.md` § Impact › "Promote exactly one decision" states that fact explicitly and names the note as the only source for the 005 file. The user confirmed no entry survives as a separate ADR — the four are spike-execution decisions that die with the spike, and the one durable conclusion is the engine structure the note recommends. The same paragraph now also carries the promoted file's full skeleton — the `# Decisions: engine-structure-spike` title, the single `## ADR:` heading, the `**ID:** engine-structure-<handrolled|langgraph>` slug — which task 10 repeats, closing a round-1 advisory that `recorder-agent` could not have derived those from the field list alone.
- **Promotes to ADR:** no

### [14] [plan-review] The plan's two hardest tasks had a mandate to succeed and no exit

- **Finding:** `[EFFORT_MISESTIMATION]`, round 1. Task 7 carried a stop rule; tasks 5 and 6 carried none, while the plan simultaneously predicted they would hit a wall ("if a `BaseCheckpointSaver` method cannot be satisfied by `SessionStorePort` as recorded, that gap is the single most valuable finding"). The gap is real and checkable now: `packages/core/src/ports/session-store.ts` holds one `StoredSession` per `SessionId` with no `delete` and a `list()` returning ids, while a checkpointer needs a per-thread checkpoint series — `getTuple` by `checkpoint_id`, `list` returning history, `putWrites`, `deleteThread`. § Requirements then made "Both arms produce the same observable round" a pass/fail gate, contradicting § This is a throwaway spike's "Code that fails to build is still a finding if the note records why", with nothing telling `/speq:implement` which sentence governs.
- **Direction change:** Tasks 5 and 6 each gained a stop rule in task 7's shape — 300 non-blank non-comment LOC, or three distinct failed attempts, whichever comes first, with the reached state, the attempt count, and the blocking `BaseCheckpointSaver` member named verbatim as the axis-1 measurement. § Requirements gained the row "Arm B may end blocked" stating that a blocked arm B satisfies the plan when tasks 9 and 10 record the blocking member and the note argues from that fact; the round row now reads "Both arms produce the same observable round, or arm B's failure to is recorded per the arm-B-blocked path". Task 9 states that a blocked arm B is an axis-1 result, never a "not obtained". Task 6 also states that tasks 7 and 8 still run after a stop, since binding cost and hermetic route are measurable independently of the resume.
- **Promotes to ADR:** no

### [15] [plan-review] Arm B's hermetic answer was hardwired to a binding it does not need

- **Finding:** `[UNSTATED_ASSUMPTION]`, round 1. Task 8 recorded "hermetic run not achievable without a real backend" as axis 4's arm-B value whenever task 7's custom binding did not complete. The load-bearing belief — that a hermetic arm-B round requires the custom `BaseChatModel` over `LlmPort` — was never established. `@langchain/core` publishes chat-model test doubles of its own under `@langchain/core/utils/testing`, which a graph node can be driven by with no backend and no custom binding. The plan would then have recorded a false negative on a measured axis inside an ADR whose Status is `Accepted` and whose reversal § Impact calls a rewrite of the question-tree model — while tasks 5, 6, and 7 each mandate a Context7 query and this question got none.
- **Direction change:** Task 8 now opens with a Context7 query for `@langchain/core/utils/testing` before arm B's hermetic answer is decided, drives `arm-b/round.spike.test.ts` through the task-7 binding if it completed and otherwise through a LangChain-supplied fake chat model, and records the value as "achievable via `<route>`, at `<LOC>` cost" — reserving "not achievable" for the case where no route exists. The axis-4 metric row in § The four evaluation axes and the § Verification › Manual Testing "Arm B, hermetic" row carry the same conditioning, so the recorded metric, the task, and the manual-test expectation now agree.
- **Promotes to ADR:** no

### [16] [plan-review] Four measurements had no stated rule turning them into one recommendation

- **Finding:** `[AMBIGUOUS_REQUIREMENT]`, round 1. Task 10 said only "weigh" — no weighting, no thresholds — while three of the four axes already carried their answer in the plan's own prose. Axis 1's LOC comparison was settled by construction, arm A mandated to carry no abstraction against arm B's required five-member abstract class, with the concept-count cell pre-writing arm B's answer. Axis 2's binary was already answered in § Impact. Axis 4's dependency weight was pre-known. Axis 3 the plan itself calls unmeasurable by one round, which also collides with its own "estimate nothing" rule. The result would have been an ADR recorded `Accepted` and declared irreversible in practice whose conclusion no measurement could have changed — the exact failure entry [12] names, which its ordering countermeasure does not catch.
- **Direction change:** `plan.md` § Decision gained `#### The decision rule`, written before implementation starts: a weight table putting axis 2 first as a gate, axis 1 primary, axis 4 secondary with the `InterviewState`/`schemaVersion` cell as a second gate, and axis 3 last; six numbered conditions every one of which must hold for the note to recommend LangGraph.js, each a measured value rather than a judgement; and the rule that hand-rolled wins if any of conditions 1 through 5 fails, named and cited. Axis 1's condition is stated as an absolute 200-LOC budget for arm B rather than an A-versus-B ratio, precisely because the ratio is settled by construction and the absolute number is not. A closing rule says an axis no measurement could move is recorded as "not decision-relevant: settled by construction" with the construction named, published in `measurements/comparison.md` but dropped from the weighing. Axis 3 is reclassified in § The four evaluation axes as extrapolation, excluded from the estimate-nothing rule and weighted last. Task 10 must cite the rule by name and show each axis's measured value against its stated threshold.
- **Promotes to ADR:** no

### [17] [plan-review] The decision rule's overriding gate cited a guardrail that does not say what it said

- **Finding:** `[AMBIGUOUS_REQUIREMENT]`, round 2. Condition 1 — the gate that "ends the case regardless of every other number" — required arm B to keep "`InterviewState` v1 **with `schemaVersion`** as the on-disk shape of `session.json`" and grounded itself in a collision with the `On-Disk-Session-Schema` guardrail, which is `fest`. Both halves are wrong. `schemaVersion` is an envelope field the store writes itself: `toEnvelope` in `packages/server/src/adapters/session-store/filesystem-session-store.ts:342-350` sets it unconditionally and passes `state` through untouched, and the envelope types `state` as `unknown` and never interprets it. Since § Both arms sit on the same real store puts both arms on `createFilesystemSessionStore`, both produce a `session.json` carrying `schemaVersion` whatever `state` holds — so that half of the condition could not come out either way. And the guardrail at `specs/roadmap.md:48` governs the envelope field, not `TState`'s shape; `packages/core/src/interview/state.ts:6-8` says so in the repository's own words ("it versions the on-disk envelope, not the domain state it wraps"). The same `session.json` therefore supported both verdicts, and the stated justification supported neither, letting a task-10 author end the LangGraph case by naming a `fest` guardrail that was never breached — inside an ADR § Impact calls irreversible in practice.
- **Direction change:** Condition 1 now states a predicate a measurement can fail: `session.json`'s `state` field round-trips as `InterviewState` v1 — `{ turns: Turn[] }`, each turn's `status`, `question`, and `askedAt` plus `answer`/`answeredAt` when answered, readable without LangGraph — by a mechanism task 5 implemented and recorded. `with schemaVersion` is deleted, and the condition names its real ground: `specs/mission.md`'s readable-session promise and the `TState`-growth rationale `specs/roadmap.md:48` states, explicitly **not** the `schemaVersion` field, with the `toEnvelope` citation recording why that field discriminates nothing. The axis-1 `session.json` paragraph carries the same correction, and the weight table's axis-4 row no longer names the `schemaVersion` cell as the gate — it names the "who owns the persisted shape" cell. This supersedes the axis-4 gate as entry [16] recorded it. The round's six advisories were applied in the same pass and are report-only: the decision rule gained a "blocked arm B is decided by condition 2" paragraph; the unreachable-condition clause gained its three limits (per condition, never per axis; a measured `fail` is a failure; a gate is never dropped); condition 5 is re-stated as a bounded judgement with `packages/server` pre-committed as acceptable and a fourth package excluded; condition 2's second sentence separates task 5's ceiling on the same artifact from task 6's ceiling on the graph wiring; "the blocking `BaseCheckpointSaver` member" becomes "the blocking API" wherever a task-6 stop could be meant; and § Goals bullet 1 plus the "Arm B, live" verification row now admit the blocked-arm-B path.
- **Promotes to ADR:** no
