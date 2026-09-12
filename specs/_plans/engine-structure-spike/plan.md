# Plan: engine-structure-spike

## Summary

Build the M3 round twice — once over a hand-rolled turn loop with direct `SessionStorePort.save`/`load`, once over LangGraph.js `interrupt()` with a hand-written `SessionStorePort`-backed checkpointer — and measure what each costs. The single durable output is an ADR-ready decision note recommending one engine structure for M7; all spike code is discarded.

## This is a throwaway spike, not a feature

Read this section before any other. It governs every task below.

**No spike code ever reaches `main`.** Every file under `spike/` and every branch-local config edit lives on `spike/engine-structure` and is never merged. The branch is tagged so it stays reachable after deletion, and the ADR links the tag.

**Three artefacts reach `main`, all of them prose:** `specs/_decision/005-engine-structure-spike.md`, the plan archive under `specs/_recorded/005-engine-structure-spike/`, and the `specs/roadmap.md` status bump. § Impact tells `/speq:record` exactly which edits to make.

**No feature spec is written, amended, or recorded.** This plan carries no spec delta. `speq plan validate engine-structure-spike` passes and prints `Note: No delta specs found in plan`; that note is the expected result, not a defect to fix. The permanent specs this spike leans on — `platform/session-store-port`, `adapters/filesystem-session-store`, `adapters/ollama-llm-adapter`, `interview/single-question-interview`, `platform/monorepo-workspace` — are consumed unchanged. Changing any of them would defeat the spike's premise.

**`packages/` and `tests/` stay untouched.** `packages/core`, `packages/server`, `packages/web`, and `tests/workspace.test.ts` receive no edit on the spike branch. The root checklist in § Verification runs green on the spike branch, and that green run is the evidence that they were not touched.

**The deliverable is the note.** Code that fails to build is still a finding if the note records why. Code that builds beautifully and produces no measurement is a failure.

## Design

### Context

`specs/roadmap.md` § Technische Leitplanken carries one open guardrail. The row reads: "Hand-gerollter Zustandsautomat **oder** LangGraph.js in `core`. M3 baut beide Turn-Loop-Varianten als Wegwerf-Spike (Fokus: Persistenz-Integration `SessionStorePort` vs. LangGraph-Checkpointer)." Status: `offen — Spike in M3`. M7 builds the question tree "in der in M3 entschiedenen Struktur", M8 the turn loop on top of it, M13 the clarification follow-up. Three milestones inherit whatever this plan concludes.

Four forces shape the spike.

The question is about persistence, not orchestration. LangGraph's graph API is easy to admire on a slide. What the roadmap flagged is narrower and harder: chrysalyst already owns `SessionStorePort`, a domain-vocabulary port with a real filesystem adapter writing `session.json` plus `transcript.md` per session. LangGraph persists through a `BaseCheckpointSaver` whose vocabulary is its own — checkpoints, channel versions, pending writes — and no filesystem saver ships with it. Whether those two can be made one thing, and at what cost, is the question. Everything else in this plan exists to answer it.

One round is enough to answer it, and more than one round is not. The M3 round already crosses the boundary that matters: a question is produced, persisted, the process ends, a later process resumes and records an answer. That is exactly one `interrupt()`/`Command({ resume })` cycle in arm B and one `save`/`load` pair in arm A. A second turn would add graph-shape evidence the spike cannot ground anyway — M7's requirements do not exist yet — while doubling the code that gets thrown away.

The decision must be made, not merely informed. The user settled this in the interview: the note recommends one structure and records as an ADR with Status `Accepted`. A note that lists trade-offs and defers re-runs the same investigation at M7 against a deadline, which is the outcome the guardrail exists to prevent.

The spike must not be able to contaminate the product. The strongest form of that guarantee is structural rather than procedural: the spike lives outside the `packages/*` workspace glob, in its own nested pnpm project with its own lockfile, on a branch that is never merged. § Decision explains why each of those three is load-bearing.

**Goals**

- Both arms produce the same observable round against real Ollama, crossing a real process boundary between question and answer — or arm B's failure to do so is recorded per § Requirements' row "Arm B may end blocked".
- Four evaluation axes measured, each with a stated metric and a recorded number or verbatim excerpt.
- One ADR-ready note recommending one structure for M7, with the rejected option's case stated fairly.
- `packages/`, `tests/`, the root lockfile, and `pnpm-workspace.yaml` provably unedited.

**Non-Goals**

- **No spike code is merged.** Nothing under `spike/` reaches `main`, now or later. M7 reimplements from the note, not from this code.
- No spec delta, no feature spec, no scenario, and no permanent test. This plan records the ADR and nothing else.
- No edit to `packages/core`, `packages/server`, `packages/web`, or `tests/workspace.test.ts`.
- No HTTP route, no SSE, no browser, no `packages/web` involvement. The harness stops at the core round plus persistence.
- No second turn, no question tree, no branch selection, no distillation. M7 through M10 own them.
- No production adoption of LangGraph in this plan even if it wins. The ADR is the adoption; M7 executes it.
- No German. The spike reuses the existing English `OPENING_SYSTEM_PROMPT` intent; M5 owns locales.
- No CI. C2 remains open and no runner sees this branch.
- No performance benchmark. Time to first token was measured by `004-single-question-walking-skeleton`; re-measuring it here would compare two harnesses, not two structures.

### Decision

#### Layout

```
chrysalyst/                                   branch: spike/engine-structure
├── packages/                UNTOUCHED        (workspace glob `packages/*`)
├── tests/workspace.test.ts  UNTOUCHED        (green, proves the above)
├── pnpm-workspace.yaml      UNTOUCHED        `packages: ['packages/*']`
├── pnpm-lock.yaml           UNTOUCHED        no dependency added to the workspace
├── eslint.config.js         branch-only      `ignores: [..., 'spike/**']`
├── .prettierignore          branch-only      `spike/`
└── spike/engine-structure/            ← its own pnpm project, outside the workspace
    ├── pnpm-workspace.yaml            `packages: []`  — makes pnpm treat this as a root
    ├── package.json                   links @chrysalyst/core + @chrysalyst/server
    ├── pnpm-lock.yaml                 the spike's own; the repo's stays untouched
    ├── tsconfig.json · vitest.config.ts
    ├── shared/                        store wiring · fake LlmPort · metrics recorder
    ├── arm-a/                         hand-rolled turn loop + direct save/load
    ├── arm-b/                         StateGraph + interrupt() + checkpointer
    └── measurements/                  raw per-arm metric dumps (JSON + captured output)
```

Three isolation mechanisms, each answering a different failure mode.

`spike/` sits outside `packages/*`, so `tests/workspace.test.ts`'s `enumerates exactly the three workspace packages` keeps passing with no edit, and `pnpm-workspace.yaml` needs none. This is what the user's constraint "the LangGraph.js arm must not make `packages/core` depend on it" reduces to structurally.

`spike/engine-structure/pnpm-workspace.yaml` declaring `packages: []` makes pnpm resolve that directory as its own workspace root rather than walking up to the repository's. Without it, `pnpm install` inside the spike either refuses the directory as a non-member or reaches the repository lockfile. With it, `@langchain/*` installs into the spike's own `node_modules` and `pnpm-lock.yaml` at the repository root is provably unchanged — `git status` is the check, and § Verification makes it a checklist row.

The branch is never merged. Two config files must still be edited on it: `pnpm lint` runs `eslint .` and `pnpm format:check` runs `prettier --check .`, both of which reach `spike/`. ESLint's `strictTypeChecked` would then demand the spike files belong to a TypeScript project they are deliberately outside of. Adding `spike/**` to the root `ignores` array and `spike/` to `.prettierignore` is the smallest edit that keeps the root checklist meaningful, and both edits die with the branch.

#### The scan that decides one file-naming rule

`tests/workspace.test.ts:191` reads:

```ts
const liveTestFiles = filesUnder('', (name) => name.endsWith('.live.test.ts'));
```

`filesUnder('')` walks the whole repository from the root, skipping only `node_modules`, `dist`, `coverage`, and dot-directories. `spike/` is therefore walked. Every file it finds must gate its suite with `describe.skipIf` on `CHRYSALYST_LIVE_LLM` and must contain no module-scope `await`.

**No file under `spike/` may be named `*.live.test.ts`.** The suffix is `*.spike.test.ts`. That one naming rule is what keeps `tests/workspace.test.ts` both untouched and green while the spike holds files that talk to a real Ollama. Naming a spike harness `*.live.test.ts` instead would force either an edit to the invariant test or a convention the spike has no reason to follow.

#### Both arms sit on the same real store

Both arms link the real packages rather than copying them:

```jsonc
// spike/engine-structure/package.json
"dependencies": {
  "@chrysalyst/core":   "link:../../packages/core",
  "@chrysalyst/server": "link:../../packages/server"
}
```

`@chrysalyst/core` exports `./src/index.ts` directly, so `SessionStorePort`, `StoredSession`, `SessionId`, `LlmPort`, `ClockPort`, and `InterviewState` resolve as source. `@chrysalyst/server` declares no `exports` field, so its adapters are reachable by deep path — `@chrysalyst/server/src/adapters/session-store/filesystem-session-store.ts` and `.../llm/openai-compatible-llm.ts`. Linking rather than copying is what makes axis 1 a measurement of the real port rather than of a simplified stand-in, and it keeps `packages/` read-only in the strongest sense: the spike consumes it and never edits it.

**Fallback, if the deep-path import does not resolve** under the spike's `moduleResolution: bundler` setup: vendor exactly those two files into `spike/engine-structure/vendored/`, each with a header comment naming its source path and the `main` commit it was copied from, and record in the note that vendoring was required. The fallback is bounded to those two files; a vendoring that spreads further means the linking approach failed and that fact belongs in the note.

#### The round both arms implement

Identical observable behaviour, so the two implementations are the only variable:

```
process 1                                   process 2
──────────────────────────────────────      ─────────────────────────────────
begin(sessionId)                            resume(sessionId, answer)
  └ persist an empty round                    └ reconstitute from disk
ask the model one opening question            record the answer
  └ persist the question                      └ persist the answered round
exit ────────────── ~/.chrysalyst-spike/<arm>/<id>/ ──────────────► exit
```

The process boundary is real, not simulated: process 2 is a separate `node` invocation that shares nothing with process 1 but the session directory. A single-process resume would let in-memory state carry the answer and would prove nothing about either persistence layer, which is the one thing this spike exists to test.

The opening prompt reuses the intent of `packages/core/src/interview/single-turn-interview.ts`'s `OPENING_SYSTEM_PROMPT` — one system message asking for a single opening question and nothing else. Both arms send the same instruction, so a difference in model output is never mistaken for a difference in structure.

#### Arm B's chat-model binding is itself a finding

A LangGraph node cannot call chrysalyst's `LlmPort`. It needs a LangChain chat model, and which one is available decides how much of the existing adapter survives. Arm B therefore builds **two** bindings and measures both:

| Binding | What it costs | Why it is measured |
|---|---|---|
| `ChatOllama` from `@langchain/ollama` | Cheap to write. Bypasses `LlmPort` entirely, so production would carry two independent LLM integrations — the Vercel AI SDK adapter the `LlmPort`-Adapter guardrail fixed, and LangChain's | It is the path anyone reaches for first, so its cost is the honest baseline |
| A minimal custom `BaseChatModel` over the existing `LlmPort` | Real work. Keeps one LLM integration and honours the `LlmPort`-Adapter guardrail | It is the only binding under which LangGraph could actually enter this codebase, so its cost is the decision-relevant number |

`@langchain/openai` is deliberately not among them. The `Kein Cloud-LLM-SDK` guardrail bans the OpenAI SDK from product code, and `@langchain/openai` carries it; measuring a binding that is already excluded would produce a number the decision cannot use.

#### Patterns

| Pattern | Where | Why |
|---------|-------|-----|
| Spike outside the workspace glob | `spike/engine-structure/` with its own `pnpm-workspace.yaml` | The three-package invariant and the `packages/core` import scan stay green with no edit; `@langchain/*` never enters the repository lockfile |
| `*.spike.test.ts`, never `*.live.test.ts` | every harness file | `tests/workspace.test.ts:191` scans the whole repository for the live suffix; the rename is what keeps that file untouched |
| Real packages linked, not copied | `link:../../packages/{core,server}` | Axis 1 measures the real `SessionStorePort`, and `packages/` stays read-only |
| Two processes, one session directory | each arm's live harness | A single-process resume proves nothing about persistence |
| One shared fake `LlmPort` | `shared/fake-llm.ts` | Axis 4's testability question is answered by whether each arm can run hermetically at all, so the fake must be identical for both |
| Metrics written to a file, not to a log | `measurements/<arm>.json` | The note is written in a later task, possibly a later session; a number that exists only in scrollback is not evidence |
| Both arms finish before either is judged | tasks 3–8 precede task 9 | Writing the note against one finished arm and one imagined arm is the failure mode this ordering removes |

#### The four evaluation axes

Each axis states its metric. Task 9 records the value; task 10 weighs it. A missing value is a finding recorded as missing, never an estimate presented as a measurement.

**Axis 1 — Persistence-integration effort.** The roadmap's stated focus and the heaviest-weighted axis.

| Metric | Arm A | Arm B |
|---|---|---|
| Non-blank, non-comment LOC of the persistence-integration module | direct `save`/`load` plus the state reconstitution | the `BaseCheckpointSaver` subclass plus the `thread_id` → `SessionId` mapping |
| Distinct concepts a reader must hold to modify it | enumerate | enumerate — expect `Checkpoint`, `CheckpointTuple`, `CheckpointMetadata`, `PendingWrite`, `serde`, `thread_id`, `checkpoint_ns`, `checkpoint_id`, channel versions |
| What `session.json` actually holds | verbatim excerpt | verbatim excerpt |
| Failed attempts before the cross-process resume worked | count | count |

The `session.json` excerpts carry more weight than the LOC counts. `specs/mission.md` promises readable sessions, and the `On-Disk-Session-Schema` guardrail's own rationale is that `TState` grows across M2 → M8 → M9 → M14. If arm B's on-disk artefact is a LangGraph channel blob rather than an `InterviewState`, that is a collision with `specs/mission.md`'s readable-session promise and with the `TState`-growth rationale the `On-Disk-Session-Schema` guardrail states — not with that guardrail's `schemaVersion` requirement, which the envelope satisfies for both arms — and the note must say so in those terms.

**Axis 2 — `core` stays framework-free.** Binary, then consequential.

Does arm B's engine code import any `@langchain/*` specifier? If it does, placing that code in `packages/core` fails `tests/workspace.test.ts:297` — `core declares no runtime dependencies and its non-test source imports none` — and contradicts the `Kein Agent-Framework in der Domäne` guardrail, whose status is already `fest`. The note must then name the surviving placements and price each: move the engine to `packages/server`, which puts domain logic outside the domain package; or add a fourth package, which fails `enumerates exactly the three workspace packages` at line 210 and the mission's three-package structure. Record the transitive dependency count and the installed size of each arm's `node_modules` as the secondary number.

**Axis 3 — Question-tree and branching control for M7, M8, M13.** **Extrapolation, excluded from the estimate-nothing rule, and weighted last** — § The decision rule states what that weighting means. One round cannot measure this, so it is a written extrapolation that must cite concrete API surface from the code each arm actually produced — never a general impression. Four probes, answered for both arms:

1. How is the next branch selected from the answers so far, and where does that decision live?
2. Can a new branch be added without editing an existing dispatch?
3. How does M13's clarification follow-up re-enter an earlier point in the conversation?
4. What does M8's multi-turn loop look like, and what does it do to the persisted shape?

**Axis 4 — `TState` ownership, testability, dependency weight.**

| Metric | Recorded as |
|---|---|
| Does a hermetic round run with no Ollama? | Arm A: yes/no over the shared fake `LlmPort`, plus what it cost. Arm B: "achievable via `<route>`, at `<LOC>` cost" — the task-7 binding if it completed, otherwise a chat-model test double `@langchain/core` publishes (`@langchain/core/utils/testing`), confirmed against Context7 by task 8. "Not achievable" is reserved for the case where no route exists |
| Who owns the persisted shape | `InterviewState` v1, or LangGraph's channel serialization |
| Can arm B keep `InterviewState` v1 as the on-disk shape at all? | yes/no, with the mechanism if yes |
| Direct and transitive package count added | number per arm |
| Chat-model binding cost | LOC and outcome for both arm-B bindings per § Arm B's chat-model binding |

#### The decision rule

Written here, before any spike code exists, so the measurements cannot be selected to fit a conclusion already held. Task 10 cites this subsection by name and shows each condition's evidence against the threshold or acceptance line stated here.

**Weights.**

| Axis | Weight | Why |
|---|---|---|
| 2 — `core` stays framework-free | Gate, evaluated first | The `Kein Agent-Framework in der Domäne` guardrail is already `fest`. A LangGraph recommendation that cannot name and price a surviving placement is not a recommendation |
| 1 — Persistence-integration effort | Primary | The roadmap's stated focus and the only axis this spike measures at full cost |
| 4 — `TState` ownership, testability, dependency weight | Secondary, with one gate inside it | `specs/mission.md`'s readable-session promise and the `TState`-growth rationale the `On-Disk-Session-Schema` guardrail states make the "who owns the persisted shape" cell a gate; the rest of the axis breaks ties |
| 3 — Branching control for M7, M8, M13 | Last | Extrapolation, not measurement |

**The note recommends LangGraph.js only if every one of these holds.** Conditions 1 through 4 are measured values from `measurements/comparison.md`. Conditions 5 and 6 are judgements, bounded by the acceptance line stated with each:

1. **Axis 4, gate.** `session.json`'s `state` field round-trips as `InterviewState` v1 — `{ turns: Turn[] }`, each turn's `status`, `question`, and `askedAt` (plus `answer` and `answeredAt` when answered) readable without LangGraph — by a mechanism task 5 implemented and recorded. A LangGraph channel blob under `state` ends the case regardless of every other number. The ground is `specs/mission.md`'s readable-session promise and the `TState`-growth rationale in `specs/roadmap.md:48`, **not** the `schemaVersion` field: `createFilesystemSessionStore` writes `schemaVersion` into the envelope for both arms regardless of what `state` holds (`packages/server/src/adapters/session-store/filesystem-session-store.ts:342-350`), so it discriminates nothing.
2. **Axis 1.** The `BaseCheckpointSaver` subclass plus the `thread_id` → `SessionId` mapping lands at or under 200 non-blank non-comment LOC, and the cross-process resume works. Task 5's stop rule abandons this same artifact at 300 LOC, so the 100-line band between 200 and 300 is where arm B completed but cost too much to recommend. Task 6's 300-LOC ceiling bounds the graph and resume wiring, which axis 1's LOC metric excludes and condition 2 does not count.
3. **Axis 4.** Task 7's guardrail-compliant `BaseChatModel` binding completes inside its 200-LOC budget, so adopting LangGraph does not also mean adopting a second LLM integration beside the Vercel AI SDK adapter the `LlmPort`-Adapter guardrail fixed.
4. **Axis 4.** A hermetic arm-B round runs with no Ollama, by whichever route task 8 records.
5. **Axis 2, gate.** The note names a placement for a `@langchain/*`-importing engine and prices it. `packages/server` is an acceptable placement if the engine's public surface stays `LlmPort`- and `SessionStorePort`-shaped, so `packages/core` keeps the domain vocabulary; a fourth package is not acceptable, because it fails `tests/workspace.test.ts:210` and the mission's three-package structure. The condition fails only when no acceptable placement exists.
6. **Axis 3.** The four probes favour `StateGraph` over the hand-rolled dispatch. A probe counts as favouring an arm only when its answer cites API surface from code that arm actually produced, per § The four evaluation axes' axis-3 rule; a probe answered from framework documentation rather than from the spike's own code favours neither.

**The note recommends hand-rolled if any one of conditions 1 through 5 fails.** It names which one and cites its evidence — the measured value for conditions 1 through 4, the acceptance line for condition 5. Condition 6 does not decide alone: axis 3 is weighted last and is extrapolation, so a probe set favouring arm A while 1 through 5 all hold is recorded as a reservation inside a LangGraph recommendation rather than as a reversal of it.

**A blocked arm B is decided by condition 2.** A stop under task 5's or task 6's stop rule fails condition 2, and the note recommends hand-rolled on that condition alone, citing the blocking API, the reached LOC, and the attempt count. Conditions 1 and 4 are then recorded "not measured: arm B stopped at <rule>" and carry no weight. Condition 3 is still evaluated — task 7 runs independently of task 6 — and condition 5 is still answered, because the placement question does not depend on the resume completing. This is not the unreachable-condition case below: those are conditions this plan's construction settled before any measurement was attempted, whereas these were reachable and went unmeasured because the arm stopped.

**Axis 1's LOC condition is deliberately an absolute budget for arm B, not an A-versus-B ratio.** Task 3 mandates arm A carry no abstraction over `SessionStorePort` while arm B must implement a five-member abstract class, so the ratio is settled by construction and would decide nothing. The absolute number is reachable either way — arm B can land at 80 LOC or at 400 — which is what makes it evidence.

**Unreachable conditions are recorded, not counted — under three limits.** (a) The clause applies per condition, never per axis. (b) A condition that was measured and came out `fail` is a failure, never an unreachable condition; the clause reaches only a condition whose answer this plan's construction fixed before any measurement was attempted. (c) A gate — conditions 1 and 5 — is never dropped: if a gate is unreachable, the plan's construction is wrong, and task 10 stops and reports rather than deciding. A dropped condition is recorded as "not decision-relevant: settled by construction, not by measurement" with the construction named, published in `measurements/comparison.md`, and given no weight. A foregone number counted as evidence is the failure mode `decision-log.md` [12] names, and the ordering it prescribes does not catch it alone.

### Consequences

| Decision | Alternatives Considered | Rationale |
|----------|------------------------|-----------|
| The plan carries no spec delta at all | A spike-local spec marked non-merging, so the plan validates against a spec file | `speq plan validate` passes with zero deltas and prints `Note: No delta specs found in plan` — verified before this plan was written. A spec file that exists only to satisfy a validator that does not require it is a file `/speq:record` must then be told to ignore, which is a rule to get wrong for no gain |
| The spike lives in `spike/engine-structure/` as its own nested pnpm project | A sibling repository; a fourth workspace package; a scratch directory outside the repository | A fourth package fails the three-package invariant. A separate repository cannot link `@chrysalyst/core` and leaves the ADR pointing at code that is not reachable from the repository's history. The nested project keeps the real port in reach while `packages/*` and the root lockfile stay provably untouched |
| Both arms link the real `@chrysalyst/core` and `@chrysalyst/server` | Vendoring copies of the port and the store into the spike | Axis 1 asks what integrating with *this* `SessionStorePort` costs. A simplified copy would answer an easier question and flatter arm B, whose difficulty is precisely that a real port shape has to be reshaped into a checkpointer. Vendoring stays as a bounded fallback, and needing it is itself recorded |
| Arm B builds two chat-model bindings | `ChatOllama` alone; `@langchain/openai` alone | `ChatOllama` alone measures a path production cannot take, because it abandons `LlmPort` and leaves two LLM integrations. The custom `BaseChatModel` alone hides how much of arm B's cost is binding work rather than graph work. `@langchain/openai` is excluded outright by the `Kein Cloud-LLM-SDK` guardrail |
| The custom `BaseChatModel` is bounded and may be abandoned | Implementing it to completion however long it takes | The abandonment point is the measurement. A binding that cannot be written in 200 LOC without reaching into undocumented `@langchain/core` internals has already answered axis 4, and pushing past that spends effort on code that is thrown away either way |
| The harness stops at the core round plus persistence | Driving the full HTTP + SSE path both arms would sit behind | The SSE contract was settled by `004-single-question-walking-skeleton` and is identical for both arms, so it adds no discriminating evidence while doubling the harness. The user set this boundary in the interview |
| The note recommends one structure and records as `Accepted` | Recording as `Proposed` and deciding at M7 | Set by the user in the interview. A `Proposed` ADR re-runs this investigation at M7 against a deadline, which is what the guardrail exists to prevent. The spike is the moment the evidence is freshest |
| The spike branch is tagged and never merged; the note travels to `main` as a file copy | Merging the branch; a draft PR left open indefinitely | A file copy onto a branch cut from `main` makes "no spike code reached `main`" checkable with one `git diff --stat`, rather than trusted. The tag keeps the code reachable after the branch is deleted, which is what the ADR's pointer needs |
| `spike/**` is added to the root ESLint ignores and `.prettierignore` on the branch | Giving the spike a TypeScript project the root ESLint config can type-check | The root checklist must stay meaningful on the spike branch — it is the evidence that `packages/` was not touched. Making throwaway code pass `strictTypeChecked` spends real effort on code with a scheduled deletion date. Both edits die with the branch |

## Features

None. This plan records no feature spec, authors no spec delta, and merges nothing into the permanent specs library. It consumes `platform/session-store-port`, `adapters/filesystem-session-store`, `adapters/ollama-llm-adapter`, `interview/single-question-interview`, and `platform/monorepo-workspace` unchanged.

`speq plan validate engine-structure-spike` passing with `Note: No delta specs found in plan` is the expected result.

## Impact

Nothing ships. No user-facing behaviour changes, no package gains a dependency, no API moves, and `pnpm dev` behaves exactly as `004-single-question-walking-skeleton` left it. The spike branch is not merged, so a reader of `main` sees only three additions: a decision record, an archived plan, and a roadmap status change.

M3 completes. Both its plans are then done, and `specs/roadmap.md` § Überblick M4 becomes the next open milestone.

M7, M8, and M13 inherit a fixed engine structure. M7's question tree is built in it, M8's turn loop runs on it, and M13's clarification follow-up re-enters it. Reversing the choice after M7 means rewriting the question-tree model, which is why the ADR is `Accepted` rather than `Proposed`.

One guardrail may be re-argued by the outcome. `Kein Agent-Framework in der Domäne` is `fest` and states that the interview engine lives in `packages/core` as its own code. If the note recommends LangGraph.js, that guardrail and this ADR collide, and the note MUST say so explicitly and name the placement it proposes instead — `packages/server`, or a fourth package with the invariant edits that implies. A recommendation that leaves the collision unnamed is incomplete.

C2, the minimal CI pipeline, is skipped a third time, as `002-add-ollama-llm-adapter` `decision-log [9]` and `004-single-question-walking-skeleton` § Impact skipped it before. The consequence is unchanged: only a local run enforces § Verification.

### What `/speq:record` MUST do

**Promote exactly one decision.** The note at `specs/_plans/engine-structure-spike/decision-note.md` becomes `specs/_decision/005-engine-structure-spike.md`. `decision-log.md` carries no entry flagged `Promotes to ADR: yes`; the note is the only source for `specs/_decision/005-engine-structure-spike.md`.

The promoted file's full skeleton, in the shape `004-single-question-walking-skeleton.md` uses — one `## ADR:` section and no second one:

```markdown
# Decisions: engine-structure-spike

## ADR: <the chosen structure, as a statement>

**ID:** engine-structure-<handrolled|langgraph>
**Plan:** engine-structure-spike
**Status:** Accepted

### Context

### Decision

### Options Considered

### Consequences
```

**Merge no feature spec.** This plan authors no spec delta. `/speq:record` MUST NOT create, amend, or touch any file under `specs/<domain>/`.

**Archive the plan.** `plan.md`, `decision-log.md`, `decision-note.md`, `verification-report.md`, and any `review/round-*.md` move to `specs/_recorded/005-engine-structure-spike/`. No file under `spike/` is archived.

**Make exactly four edits to `specs/roadmap.md` and no others.**

| Location | Current | New |
|---|---|---|
| § Technische Leitplanken, row `**Engine-Struktur**` (line 44) | Status cell reads `offen — Spike in M3` | `fest` — and the decision cell names the chosen structure and points at `specs/_decision/005-engine-structure-spike.md` |
| § Überblick, row M3 (line 59) | `⬜ offen` | `✅ erledigt (004-single-question-walking-skeleton · 005-engine-structure-spike)` |
| § M7, "gebaut in der in M3 entschiedenen Struktur (hand-gerollt oder LangGraph.js)" (line 232–233) | names both options | names the chosen structure alone |
| § Querschnittsthemen, row `**Engine-Struktur**` (line 455) | `Spike in **M3**, ADR vor **M7**` | records the outcome and points at the ADR |

There is **no** `🟡 teilweise` marker anywhere in `specs/roadmap.md` — verified while planning. M3 moves straight from `⬜ offen` to `✅ erledigt`; `/speq:record` MUST NOT hunt for an intermediate marker. `004-single-question-walking-skeleton` § Impact instructed the recorder to leave M3 open because this plan was still outstanding; that instruction is now discharged.

## Requirements

| Requirement | Details |
|-------------|---------|
| Nothing under `packages/` or `tests/` is edited | `git diff --stat main...spike/engine-structure` lists no path under `packages/` or `tests/`. The root § Checklist runs green on the spike branch as corroboration |
| The repository lockfile is untouched | `pnpm-lock.yaml` and `pnpm-workspace.yaml` at the repository root are byte-identical to `main` after every spike install |
| No `*.live.test.ts` under `spike/` | `tests/workspace.test.ts:191` scans the whole repository for that suffix. The spike suffix is `*.spike.test.ts` |
| Both arms produce the same observable round, or arm B's failure to is recorded per the arm-B-blocked path | Same opening instruction, same session identifier scheme, same recorded answer text, same two-process boundary. The implementation is the only variable |
| Arm B may end blocked | A blocked arm B satisfies this plan. It is satisfied when tasks 9 and 10 record the blocking API named verbatim — the `BaseCheckpointSaver` member, or the `interrupt`/`Command`/`thread_id` behaviour the checkpointer could not satisfy — alongside the reached LOC and the attempt count from task 5's or task 6's stop rule, and the note argues its recommendation from that fact rather than treating arm B as unmeasured. A blocked arm B is an axis-1 result, not a missing value |
| The resume crosses a real process boundary | Process 2 is a separate `node` invocation sharing only the session directory with process 1 |
| Every axis value is measured or recorded as missing | No axis value is estimated. A metric that could not be obtained is written as "not obtained" with the reason |
| The note recommends exactly one structure | Status `Accepted`, one recommendation, the rejected option's strongest case stated fairly |
| No spike code reaches `main` | The note travels as a file copy onto a branch cut from `main`, never as a merge |
| English | The spike reuses the existing English opening instruction. M5 owns locales |

## Dependencies

**The repository gains none.** Every package below installs into `spike/engine-structure/node_modules` under the spike's own lockfile.

| Package | Version at planning time | Arm | Purpose |
|---|---|---|---|
| `@langchain/langgraph` | 1.4.14 | B | `StateGraph`, `interrupt`, `Command` |
| `@langchain/langgraph-checkpoint` | 1.1.5 | B | `BaseCheckpointSaver`, `CheckpointTuple`, the serializer |
| `@langchain/core` | 1.2.10 | B | `BaseChatModel` for the custom binding |
| `@langchain/ollama` | 1.3.0 | B | `ChatOllama`, the cheap binding |
| `@chrysalyst/core` | `link:../../packages/core` | A, B | `SessionStorePort`, `StoredSession`, `SessionId`, `LlmPort`, `ClockPort`, `InterviewState` |
| `@chrysalyst/server` | `link:../../packages/server` | A, B | the real filesystem session store and the real Ollama adapter |
| `typescript`, `vitest`, `@types/node` | match the repository catalog | A, B | the spike's own toolchain, pinned separately |

Versions above were read from the registry while planning. **Re-verify every `@langchain/*` API against Context7 before writing arm-B code** — the `context7 vor Lib-Code` rule in `CLAUDE.md` applies, and tasks 5, 6, and 7 each name it. The facts this plan rests on and that must be re-confirmed: `interrupt(value)` is called inside a node and surfaces on the result as `__interrupt__`; resuming re-invokes the graph with `new Command({ resume })` and the same `thread_id` in `config.configurable`; `interrupt()` requires a checkpointer; `BaseCheckpointSaver` exposes `getTuple`, `list`, `put`, `putWrites`, and `deleteThread`; **no filesystem checkpointer ships** — only in-memory, SQLite, Postgres, MongoDB, and Redis — which is why arm B must hand-write one.

The live harness needs a running Ollama holding `qwen3:8b`, invoked with `CHRYSALYST_LLM_MODEL=qwen3:8b`. `llama3.2:3b`, the `adapters/ollama-llm-adapter` default, is not pulled on this host. Every hermetic harness runs with no daemon and no network.

## Implementation Tasks

Tasks 1 and 2 build the ground both arms stand on. Tasks 3–4 and 5–8 are the two arms and are independent of each other. Task 9 measures, task 10 writes the note, task 11 moves it to `main`. Read § This is a throwaway spike before starting any of them.

1. **Branch and skeleton.** Create `spike/engine-structure/` with its own `pnpm-workspace.yaml` declaring `packages: []`, a `package.json` linking `@chrysalyst/core` and `@chrysalyst/server` per § Both arms sit on the same real store, a `tsconfig.json` extending nothing from the repository (the spike is outside every project), and a `vitest.config.ts` including `**/*.spike.test.ts` and nothing else. Add `'spike/**'` to the `ignores` array in the root `eslint.config.js` and `spike/` to `.prettierignore`, and note in the commit message that both edits are branch-only. Run `pnpm install` inside `spike/engine-structure/`, then prove the isolation held: `git status` shows the repository's `pnpm-lock.yaml` and `pnpm-workspace.yaml` unmodified, and `pnpm -r --include-workspace-root test` at the repository root still passes with `tests/workspace.test.ts` unedited. Show both outputs. If `pnpm install` inside the spike reaches the repository lockfile despite the nested `pnpm-workspace.yaml`, stop and report before continuing — that isolation is a precondition for every later task.

2. **Shared harness ground.** Write `spike/engine-structure/shared/`: a store factory building the real `createFilesystemSessionStore` rooted under a per-arm directory, taking the root from `CHRYSALYST_SESSION_DIR` with a documented default; a real-LLM factory over `createOpenAiCompatibleLlm` reading `CHRYSALYST_LLM_BASE_URL` and `CHRYSALYST_LLM_MODEL`; a fake `LlmPort` yielding a scripted chunk list, used identically by both arms' hermetic harnesses; the opening instruction, copied from `packages/core/src/interview/single-turn-interview.ts`'s `OPENING_SYSTEM_PROMPT` with a header comment naming the source; and a metrics recorder appending `{ axis, metric, value }` records to `measurements/<arm>.json`. Confirm the deep-path imports of the two `@chrysalyst/server` adapters resolve; if they do not, apply the bounded vendoring fallback in § Both arms sit on the same real store and record that it was needed. Show a passing smoke run that saves and loads one session through the real store with no model involved.

3. **Arm A — the hand-rolled turn loop.** Write `spike/engine-structure/arm-a/` adapting `createSingleTurnInterview`'s logic from `packages/core/src/interview/single-turn-interview.ts` into the spike: `begin` persists an empty round; `askOpeningQuestion` streams from the model, accumulates, and persists the asked turn only after the model's last chunk; `recordAnswer` loads, completes the turn, and persists. Direct `SessionStorePort.save`/`load` throughout, no abstraction over them — the point of the arm is to show exactly what that costs. Keep the in-flight guard and the shared-production cancellation out: they are M3 product concerns that arm B has no counterpart for, and including them would inflate arm A's LOC against nothing. Copy `packages/core`'s source; do not edit it.

4. **Arm A — harness and both runs.** Write `arm-a/round.spike.test.ts` driving the whole round over the fake `LlmPort` and a `mkdtemp` store, asserting the persisted state after each step. Write `arm-a/live-ask.ts` and `arm-a/live-answer.ts` as two separate entry points so the resume crosses a real process boundary: the first begins a session, asks the real model, persists, and prints the session identifier; the second is invoked with that identifier in a fresh `node` process, loads, records an answer, and persists. Run both against Ollama holding `qwen3:8b` and capture the two `session.json` files verbatim into `measurements/`. Record axis 1's LOC, concept list, and failed-attempt count, and axis 4's hermetic-run answer.

5. **Arm B — the `SessionStorePort`-backed checkpointer.** [expert] Query Context7 for the current `BaseCheckpointSaver` contract before writing a line. Then write `spike/engine-structure/arm-b/session-store-checkpointer.ts`: a `BaseCheckpointSaver` subclass whose storage is the real `SessionStorePort`. Decide and document, in the module's doc comment, how `thread_id` maps to `SessionId`, how a `CheckpointTuple` is reconstituted from a `StoredSession`, what `TState` the store is parameterised at, how `putWrites` is honoured, and what `list` returns given a port with no query surface. Record the friction as it happens — every failed attempt at the cross-process resume is an axis-1 data point and is worth more than a clean final diff. Capture the resulting `session.json` verbatim. Do not simplify the port to make the subclass easier; if a `BaseCheckpointSaver` method cannot be satisfied by `SessionStorePort` as recorded, that gap is the single most valuable finding in this spike and must be written down in full rather than engineered around. **Stop and record the reached state if the checkpointer exceeds 300 non-blank non-comment LOC, or if three distinct attempts at satisfying a `BaseCheckpointSaver` member over `SessionStorePort` fail; the reached state, the attempts, and the blocking member named verbatim are the axis-1 measurement.** A stopped task 5 does not fail the plan — see § Requirements row "Arm B may end blocked".

6. **Arm B — the graph, the interrupt, and the resume.** [expert] Query Context7 for the current `StateGraph`, `interrupt`, and `Command` API before writing a line. Build the graph: a node that asks the opening question through a chat model, an `interrupt()` after it that surfaces the question to the caller, and a node after the resume that records the answer. Compile with the task-5 checkpointer. Drive it with `ChatOllama` from `@langchain/ollama` as the first binding. Prove the resume works with the same `thread_id` in `config.configurable` and `new Command({ resume: answer })`, across two processes. Record what `interrupt()` requires of the checkpointer that task 5 did not anticipate. **Stop and record the reached state if the graph plus the resume wiring exceeds 300 non-blank non-comment LOC, or if three distinct attempts at the cross-process resume fail; the reached state, the attempts, and the blocking API named verbatim — the `BaseCheckpointSaver` member, or the `interrupt`/`Command`/`thread_id` behaviour the checkpointer could not satisfy — are the axis-1 measurement.** A stopped task 6 does not fail the plan — see § Requirements row "Arm B may end blocked". Tasks 7 and 8 still run: the binding cost and the hermetic route are measurable independently of whether the resume completed.

7. **Arm B — the guardrail-compliant binding, bounded.** [expert] Query Context7 for the current `BaseChatModel` abstract surface. Write the minimal `BaseChatModel` subclass over chrysalyst's existing `LlmPort` — enough for one node to call, streaming if the abstract surface makes it cheap. **Stop and record the reached state if it exceeds 200 non-blank non-comment LOC, or if it requires reaching into `@langchain/core` internals beyond the documented abstract members.** The abandonment point is the measurement; pushing past it spends effort on code that is discarded either way. Record LOC, outcome, and the blocking reason if it blocked — this is the number that decides whether LangGraph can enter this codebase without a second LLM integration.

8. **Arm B — harness and both runs.** Query Context7 for the chat-model test doubles `@langchain/core` publishes (`@langchain/core/utils/testing`) before deciding arm B's hermetic answer. Write `arm-b/round.spike.test.ts` driven through the task-7 binding if it completed, otherwise through a LangChain-supplied fake chat model. Record axis 4's arm-B value as "achievable via `<route>`, at `<LOC>` cost" and reserve "not achievable" for the case where no route exists. Write `arm-b/live-ask.ts` and `arm-b/live-answer.ts` mirroring task 4's two-process shape. Run both against Ollama holding `qwen3:8b` and capture the two `session.json` files verbatim into `measurements/`.

9. **Measure all four axes.** With both arms finished and run, fill every metric in § The four evaluation axes into `measurements/comparison.md`: the LOC counts and concept lists (axis 1), the two `session.json` excerpts side by side (axis 1), the `@langchain/*` import answer and the transitive dependency count and `node_modules` size per arm (axis 2), the four branching probes answered with citations to code each arm actually produced (axis 3), and the testability, ownership, and binding numbers (axis 4). Write "not obtained" with a reason wherever a metric could not be measured. Estimate nothing — axis 3 excepted, which § The four evaluation axes classifies as extrapolation. If task 5 or task 6 stopped under its stop rule, `measurements/comparison.md` records the blocked arm B as an axis-1 **result** — the blocking API named verbatim (the `BaseCheckpointSaver` member, or the `interrupt`/`Command`/`thread_id` behaviour the checkpointer could not satisfy), the reached LOC, the attempt count — and never as "not obtained"; "not obtained" is reserved for metrics no one tried to take.

10. **Write the decision note.** [expert] Write `specs/_plans/engine-structure-spike/decision-note.md` in the full skeleton § Impact › "Promote exactly one decision" states: the file title `# Decisions: engine-structure-spike`, one section `## ADR: <the chosen structure, as a statement>`, then `**ID:** engine-structure-<handrolled|langgraph>`, `**Plan:** engine-structure-spike`, `**Status:** Accepted`, then `### Context` / `### Decision` / `### Options Considered` (table with ✓/✗ verdicts) / `### Consequences`. One `## ADR:` section and no second one. Recommend exactly one structure for M7 and justify it from `measurements/comparison.md`, citing numbers rather than impressions. **Cite § The decision rule by name and show each condition's evidence against its stated threshold or acceptance line**, including any condition recorded as not decision-relevant with the construction that settled it, and any condition recorded as not measured because arm B stopped. If task 5 or task 6 stopped under its stop rule, argue the recommendation from the blocking API as recorded — the `BaseCheckpointSaver` member, or the `interrupt`/`Command`/`thread_id` behaviour the checkpointer could not satisfy — per § Requirements row "Arm B may end blocked" and § The decision rule's "A blocked arm B is decided by condition 2". State the rejected option's strongest case fairly — a note that cannot argue the other side has not understood its own conclusion. If the recommendation is LangGraph.js, § Impact requires naming the collision with the `Kein Agent-Framework in der Domäne` guardrail and the placement proposed instead. `### Consequences` must say what M7, M8, and M13 each inherit.

11. **Move the note to `main` and tag the spike.** Tag the spike branch's last commit `spike/engine-structure-m3` and push the tag, so the code stays reachable after the branch is deleted; put the tag name into the note's `### Consequences`. Cut a branch from `main`, copy **only** `decision-note.md` and `verification-report.md` (plus `review/round-*.md` if code review produced any) into `specs/_plans/engine-structure-spike/`, and verify with `git diff --stat main...<branch>` that every listed path starts with `specs/`. Never merge `spike/engine-structure` into `main`.

## Parallelization

| Parallel Group | Tasks |
|----------------|-------|
| Group A | 1 → 2 (ordered; every later task needs both) |
| Group B | 3 → 4 (arm A, one ordered stream) |
| Group C | 5 → 6 → 7 → 8 (arm B, one ordered stream) |
| Group D | 9 → 10 → 11 (ordered) |

Sequential dependencies:

- Group A → Groups B and C. Both arms need the linked store, the fake `LlmPort`, and the shared opening instruction.
- Groups B and C → Group D. Task 9 compares two finished arms; writing the note against one finished arm and one imagined arm is the failure mode this ordering removes.

Groups B and C share no file and neither imports the other, so they run concurrently. Tasks 4 and 8 both drive the single local Ollama and MUST NOT run concurrently; serialize the two live runs even when Groups B and C otherwise overlap. Within Group C the order is strict: the checkpointer exists before the graph that compiles with it, and the graph works before the binding it will be retrofitted with is judged.

Four tasks carry `[expert]` and seven do not. Task 5 reshapes a domain-vocabulary port into a framework's checkpoint contract with no reference implementation to copy — no filesystem saver ships with LangGraph — and its friction *is* the spike's primary measurement, so it needs an implementer who records what went wrong instead of quietly routing around it. Task 6 owns the `interrupt()`/`Command`/`thread_id` resume across a real process boundary, where a mistake looks like working code that silently resumes from memory. Task 7 requires judging when to stop, which is a decision rather than an implementation. Task 10 weighs four axes into an architectural recommendation three milestones inherit and that the ADR makes irreversible in practice.

Tasks 1, 2, 3, 4, 8, 9, and 11 are untagged: project scaffolding, adapting code that already exists and works, a harness mirroring one already written, transcription of measured numbers, and git operations on named paths.

Two tasks have human-visible preconditions. Tasks 4 and 8 need a running Ollama holding `qwen3:8b`, and task 11 pushes a tag, which `/speq:git-discipline` puts behind explicit approval.

## Dead Code Removal

Nothing is removed from `main`. This plan adds no production code, deletes none, and leaves every module `004-single-question-walking-skeleton` shipped exactly as it stands.

All spike code is dead by construction. `spike/engine-structure/` in its entirety, plus the two branch-only config edits to `eslint.config.js` and `.prettierignore`, exist only on `spike/engine-structure` and are never merged. Deletion happens by not merging, and the tag `spike/engine-structure-m3` is what keeps the code readable afterwards. M7 reimplements from the note; it does not resurrect this code.

| Type | Location | Reason |
|------|----------|--------|
| Directory | `spike/engine-structure/` (branch only) | Throwaway by design; discarded by never merging |
| Config edit | `eslint.config.js` — `'spike/**'` in `ignores` (branch only) | Exists only to keep the root checklist meaningful while spike files are present |
| Config edit | `.prettierignore` — `spike/` (branch only) | Same |
| Branch | `spike/engine-structure` | Deleted after the tag is pushed and the note reaches `main` |

## Verification

### Scenario Coverage

**None, and deliberately so.** This plan authors no feature spec and therefore no scenario, so the scenario-to-test mapping is empty rather than incomplete. No permanent test is added and no existing test is edited.

The evidence for this plan is § Manual Testing: two arms run against a real model across a real process boundary, four axes measured into `measurements/comparison.md`, and one note recommending one structure. The `*.spike.test.ts` files listed there are the arms' own harnesses; they live and die with the branch and are never part of the repository's suite — root `vitest.config.ts` includes `tests/**/*.test.ts` only, so no spike file is collected by `pnpm -r --include-workspace-root test`.

### Manual Testing

| Subject | Command | Expected Output |
|---------|---------|-----------------|
| Isolation | `pnpm install` inside `spike/engine-structure/`, then `git status --short` at the repository root | `pnpm-lock.yaml` and `pnpm-workspace.yaml` unmodified; the only untracked path is `spike/`. Task 1's artefact and a precondition for every later task |
| Isolation | `pnpm -r --include-workspace-root test` at the repository root, on the spike branch | 0 failures with `tests/workspace.test.ts` unedited — the three-package invariant, the `packages/core` import scan, and the `*.live.test.ts` convention all still green with `spike/` present |
| Isolation | `git diff --stat main...spike/engine-structure` | No listed path starts with `packages/` or `tests/`. Only `spike/`, `eslint.config.js`, `.prettierignore`, and `specs/_plans/engine-structure-spike/` appear |
| Arm A, hermetic | `pnpm vitest run arm-a` inside `spike/engine-structure/` | The round passes over the fake `LlmPort` with no daemon and no network. Axis 4's testability value for arm A |
| Arm A, live | `CHRYSALYST_LLM_MODEL=qwen3:8b node arm-a/live-ask.ts`, then `CHRYSALYST_LLM_MODEL=qwen3:8b node arm-a/live-answer.ts <id>` in a **fresh** shell | The first prints a session identifier and a question from the real model; the second, in a separate process, records the answer. `session.json` afterwards holds the question, the answer, both instants, and `schemaVersion`. Captured verbatim into `measurements/` |
| Arm B, hermetic | `pnpm vitest run arm-b` inside `spike/engine-structure/` | Passes through the task-7 binding, or through the `@langchain/core` chat-model test double task 8 confirmed against Context7. Recorded as "achievable via `<route>`, at `<LOC>` cost"; "not achievable" only if no route exists. Axis 4's testability value for arm B |
| Arm B, live | `CHRYSALYST_LLM_MODEL=qwen3:8b node arm-b/live-ask.ts`, then `CHRYSALYST_LLM_MODEL=qwen3:8b node arm-b/live-answer.ts <id>` in a **fresh** shell | The first interrupts after the question and persists a checkpoint; the second resumes with `Command({ resume })` on the same `thread_id` and records the answer. Whatever `session.json` holds is captured verbatim — including if it is a channel blob rather than an `InterviewState`. If task 5 or task 6 stopped under its stop rule, the expected output is the recorded blocking API, the reached LOC, and the attempt count in place of a completed resume; the row passes on that record |
| Axis 2 | `grep -rl '@langchain/' arm-b/` and `du -sh node_modules` per arm | The import answer is binary and decides whether the engine could live in `packages/core` at all. The sizes are the secondary number |
| Axis 1 | `cat measurements/arm-a.json measurements/arm-b.json` | Every axis-1 metric present with a value or an explicit "not obtained" plus a reason. No estimates |
| The deliverable | `cat measurements/comparison.md` then `cat specs/_plans/engine-structure-spike/decision-note.md` | A filled comparison across all four axes, and a note in `004`'s ADR format with Status `Accepted`, one recommendation, and the rejected option's case stated fairly. Tasks 9 and 10's artefacts |
| No leakage | `git diff --stat main...<note branch>` after task 11 | Every listed path starts with `specs/`. No file under `spike/` travels to `main` |
| Reachability | `git show spike/engine-structure-m3 --stat` after task 11 | The tag resolves to the spike branch's last commit, so the ADR's pointer stays valid after the branch is deleted |

### Checklist

Run at the repository root, on the spike branch. A green run here is the evidence that `packages/` and `tests/` were not touched.

| Step | Command | Expected |
|------|---------|----------|
| Install | `pnpm install` | Exit 0; `pnpm-lock.yaml` unchanged, because no workspace package gains a dependency |
| Build | `pnpm -r build` | Exit 0 |
| Test | `pnpm -r --include-workspace-root test` | 0 failures; both `*.live.test.ts` files report as skipped; no `spike/` file is collected |
| Typecheck | `pnpm typecheck` | Exit 0 — `pnpm -r typecheck` covers the three workspace packages and not `spike/` |
| Lint | `pnpm lint` | 0 errors, 0 warnings, with `spike/**` in the root `ignores` |
| Format | `pnpm format:check` | No changes reported, with `spike/` in `.prettierignore` |
| Plan | `speq plan validate engine-structure-spike` | Passes with `Note: No delta specs found in plan` — the expected result for a spike |

The spike's own toolchain runs inside `spike/engine-structure/` and is not gated: `pnpm vitest run` there executes both arms' hermetic harnesses. Throwaway code is held to "it produced the measurement", not to the repository's quality bar.

Because C2 is still open, no runner reproduces any of this. A green checklist is evidence from one machine, and it is evidence about `packages/` rather than about the spike.
