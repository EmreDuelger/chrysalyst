# Plan Review Findings: engine-structure-spike (round 1)

## Summary

- Axes checked: 6/6
- Total findings: 13 (Blockers: 4, Advisory: 9)
- Intent Fidelity blockers: 1

Premortem — three ways this plan fails by mid-2027:

1. M7 opens `specs/_decision/005-engine-structure-spike.md` and finds five ADRs: four about spike bookkeeping (no spec delta, branch never merged, two bindings, Accepted status) plus the engine decision, because `decision-log.md` flags four entries `Promotes to ADR: yes` while `plan.md` orders "promote exactly one decision". The roadmap guardrail cell points at a file whose bulk is process trivia. → B1.
2. The ADR says "hand-rolled", but no decision rule was ever written down and three of the four axes were already answered in the plan's own prose before a line was run. M8 re-argues LangGraph, the guardrail is now `fest`, and the flip has to be reversed. → B4.
3. Implementation stalls on task 5. `SessionStorePort` holds one record per session; `BaseCheckpointSaver` needs a checkpoint history, `checkpoint_id` lookup, and pending writes. Task 6's "prove the resume works" cannot be met, the Requirements table demands both arms produce the round, and there is no "arm B blocked" exit. → B2.

---

## Intent Fidelity

#### [INTENT_DRIFT] BLOCKER

- Location: `decision-log.md` § Design Decisions entries [1], [2], [6], [9] vs. `plan.md` § Impact › "What `/speq:record` MUST do"
- Issue: the user's interview answer is "`/speq:record` promotes ONLY the ADR to `specs/_decision/005-engine-structure-spike.md`", and `plan.md` restates it: "**Promote exactly one decision.** The note at `specs/_plans/engine-structure-spike/decision-note.md` becomes `specs/_decision/005-engine-structure-spike.md`". But `decision-log.md` marks four entries `- **Promotes to ADR:** yes` — [1] "The plan carries no spec delta at all", [2] "The spike branch is never merged", [6] "Arm B builds two chat-model bindings", [9] "The ADR records as 'Accepted', not 'Proposed'". This is the established promotion mechanism in this repo: `specs/_recorded/004-single-question-walking-skeleton/decision-log.md` carries nine `yes` flags and `specs/_decision/004-single-question-walking-skeleton.md` carries seven `## ADR:` sections. `recorder-agent` following `/speq:spec-merge`'s field mapping will therefore promote four procedural decisions alongside the note, and nothing in `plan.md` tells it not to. The one instruction that could have reconciled them — "Promote exactly one decision" — is contradicted by the artifact the recorder actually reads.
- Fix: In `decision-log.md`, change entries [1], [2], [6], and [9] to `- **Promotes to ADR:** no`. Then add one sentence to `plan.md` § Impact › "Promote exactly one decision": "`decision-log.md` carries no entry flagged `Promotes to ADR: yes`; the note is the only source for `specs/_decision/005-engine-structure-spike.md`." If any of the four is genuinely meant to survive as an ADR, say so instead by naming it explicitly in that § Impact paragraph and stating the resulting section order in the 005 file.

#### [SCOPE_CREEP] ADVISORY

- Location: `plan.md` § Arm B's chat-model binding is itself a finding; § Implementation Tasks task 7
- Issue: the user scoped arm B as "LangGraph.js `interrupt()` after the question + a `SessionStorePort`-backed `BaseCheckpointSaver`, answer via `Command({ resume })` … **Focus: persistence-integration cost**", and named "an Ollama chat-model binding" (singular) only as a dependency-weight item under axis 4. The plan promotes it to a second binding with its own `[expert]` task and a 200-LOC budget, whose accepted outcome may be "it blocked". That is up to 200 lines of discarded work on the axis the user ranked lowest, in a plan whose declared heaviest axis is persistence. The planner's rationale in `decision-log.md` [6] is sound on the merits, so this is raised as a risk to acknowledge rather than a defect to remove.
- Fix: Add one line to `plan.md` § Non-Goals or to task 7 stating the priority order if effort runs long: "Task 7 is cut before tasks 5, 6, or 9 are compromised; a cut task 7 is recorded as 'not attempted' with that reason." No other change required.

---

## Feasibility

#### [EFFORT_MISESTIMATION] BLOCKER

- Location: `plan.md` § Implementation Tasks tasks 5 and 6; § Requirements row "Both arms produce the same observable round"
- Issue: task 7 gets an explicit stop rule ("**Stop and record the reached state if it exceeds 200 non-blank non-comment LOC**"). Tasks 5 and 6 — the plan's two hardest tasks — get none, and the plan simultaneously predicts they will hit a wall: "if a `BaseCheckpointSaver` method cannot be satisfied by `SessionStorePort` as recorded, that gap is the single most valuable finding". The gap is real and checkable now. `packages/core/src/ports/session-store.ts` defines `StoredSession<TState>` as exactly one `{ id, createdAt, updatedAt, state }` per `SessionId`, with `list()` returning ids and no `delete`. A checkpointer needs a per-thread checkpoint *series* (`getTuple` resolving a specific `checkpoint_id`, `list` returning history, `putWrites` storing pending writes, `deleteThread`). None of those survive a one-record-per-id port without an encoding the plan does not specify. Task 6 then states an unconditional success requirement — "**Prove** the resume works with the same `thread_id` … across two processes" — and § Requirements makes it a pass/fail gate: "Both arms produce the same observable round". That gate contradicts § This is a throwaway spike's "Code that fails to build is still a finding if the note records why", and `/speq:implement` has no way to tell which sentence governs. The result is an implementer with a mandate to succeed, a prediction that success is impossible, and no exit.
- Fix: Add a bounded stop rule to `plan.md` task 5 and task 6 in the same shape as task 7's — e.g. "Stop and record the reached state if the checkpointer exceeds 300 non-blank non-comment LOC, or if three distinct attempts at the cross-process resume fail; the reached state, the attempts, and the blocking `BaseCheckpointSaver` member are the axis-1 measurement." Then add an explicit arm-B-blocked path: a new § Requirements row "Arm B may end blocked" stating that a blocked arm B satisfies the plan when tasks 9 and 10 record the blocking member verbatim and the note argues the recommendation from that fact, and rewrite the existing row to "Both arms produce the same observable round, or arm B's failure to is recorded per the arm-B-blocked path". State in task 9 that `measurements/comparison.md` records a blocked arm B as an axis-1 result, not as a missing value.

#### [UNSTATED_ASSUMPTION] BLOCKER

- Location: `plan.md` § The four evaluation axes › Axis 4, metric "Does a hermetic round run with a fake `LlmPort` and no Ollama?"; § Implementation Tasks task 8
- Issue: task 8 hardwires arm B's axis-4 answer to task 7's completion — "through the task-7 binding if it completed, and recording 'hermetic run not achievable without a real backend' as the axis-4 value if it did not". The load-bearing belief is that a hermetic arm-B round *requires* the custom `BaseChatModel` over `LlmPort`. The plan never establishes that. LangChain publishes chat-model test doubles of its own under `@langchain/core/utils/testing` (fake list and fake streaming chat models), which a graph node can be driven by with no backend and no custom binding. If that holds, the plan will record "not achievable" for arm B on a decision axis when the truthful answer is "achievable, by a route arm A does not need". A false negative on a measured axis inside an ADR recorded `Accepted` — one the plan's own § Impact says M7, M8, and M13 inherit and that "reversing … means rewriting the question-tree model" — is the most expensive kind of error this spike can make, and tasks 5, 6, and 7 each mandate a Context7 query while this question gets none.
- Fix: In `plan.md` task 8, replace the conditional with: "Query Context7 for the chat-model test doubles `@langchain/core` publishes (`@langchain/core/utils/testing`) before deciding arm B's hermetic answer. Drive `arm-b/round.spike.test.ts` through the task-7 binding if it completed, otherwise through a LangChain-supplied fake chat model. Record axis 4's arm-B value as 'achievable via <route>, at <LOC> cost' and reserve 'not achievable' for the case where no route exists." Add the same conditioning to the axis-4 metric row in § The four evaluation axes so the recorded metric and the task agree.

#### [HIDDEN_DEPENDENCY] ADVISORY

- Location: `plan.md` § Both arms sit on the same real store; § Dependencies ("**The repository gains none.** Every package below installs into `spike/engine-structure/node_modules` under the spike's own lockfile")
- Issue: `link:../../packages/server` is a bare symlink — pnpm does not install the linked package's dependencies into the spike's tree. `packages/server/package.json` declares `ai`, `@ai-sdk/openai-compatible`, `hono`, `zod`, and `@chrysalyst/core` (`workspace:*`), and `packages/server/src/adapters/llm/openai-compatible-llm.ts` imports them. Those resolve only from `packages/server/node_modules`, which exists only because the *root* workspace was installed. The spike therefore depends on a root `pnpm install` having run, and the spike's own lockfile does not record that. § Dependencies reads as if the spike's lockfile were self-sufficient. The practical consequence lands on task 11: a reader who checks out tag `spike/engine-structure-m3` and runs the spike in isolation gets an unresolvable import, and the ADR's pointer is less useful than it claims.
- Fix: Add one row to `plan.md` § Dependencies: "A root `pnpm install` is a precondition for every spike run — `link:` symlinks `packages/server` without installing its `ai`, `@ai-sdk/openai-compatible`, `hono`, and `zod` dependencies, which resolve from `packages/server/node_modules`." Add the same sentence to task 11's note about what the tag preserves.

#### [UNSTATED_ASSUMPTION] ADVISORY

- Location: `plan.md` § Implementation Tasks task 1, "a `tsconfig.json` extending nothing from the repository (the spike is outside every project)"; § Both arms sit on the same real store, "under the spike's `moduleResolution: bundler` setup"
- Issue: two problems in one sentence. First, the stated reason is wrong — `extends` resolves a file path and has nothing to do with workspace membership; `spike/engine-structure/tsconfig.json` can extend `../../tsconfig.base.json` freely. Second, re-deriving the config invites dropping the four options that make this repo's `.ts`-source imports work at all: `tsconfig.base.json` sets `allowImportingTsExtensions`, `noEmit`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`. The last two matter concretely here: `packages/core/src/index.ts` re-exports the ports as `export type * from './ports/index.ts'`, so `SessionStorePort`, `StoredSession`, `SessionId`, `LlmPort`, and `ClockPort` have no runtime binding. Without `verbatimModuleSyntax`, a plain `import { SessionStorePort } from '@chrysalyst/core'` typechecks and then throws at runtime under Node's type stripping. `erasableSyntaxOnly` is what keeps the spike runnable by `node arm-a/live-ask.ts` at all. Separately, `moduleResolution: bundler` describes TypeScript's resolver, not Node's, so it is the wrong thing to name as the trigger for the vendoring fallback — the fallback trigger is Node's runtime resolution of the deep path.
- Fix: In `plan.md` task 1, replace "a `tsconfig.json` extending nothing from the repository (the spike is outside every project)" with "a `tsconfig.json` extending `../../tsconfig.base.json`, so the spike inherits `allowImportingTsExtensions`, `noEmit`, `verbatimModuleSyntax`, and `erasableSyntaxOnly` — the four options that make `.ts`-source imports resolve and keep the harness runnable under Node's type stripping". In § Both arms sit on the same real store, replace "under the spike's `moduleResolution: bundler` setup" with "under Node's runtime resolution of `@chrysalyst/server/src/...`".

#### [HIDDEN_DEPENDENCY] ADVISORY

- Location: `plan.md` § Implementation Tasks task 1 ("stop and report before continuing"); task 11 (tag push); § Parallelization
- Issue: two preconditions gate the plan and neither has a stated fallback. Task 1's nested-workspace isolation is the plan's single load-bearing mechanism — "If `pnpm install` inside the spike reaches the repository lockfile despite the nested `pnpm-workspace.yaml`, stop and report before continuing" — and if it fails, the plan has no second isolation route named (`--ignore-workspace`, a sibling directory outside the repository with a relative `link:`, or a `.npmrc` override). Task 11 pushes a tag, which § Parallelization correctly flags as gated by `/speq:git-discipline` and `CLAUDE.md` rule 4, and the ADR's pointer depends on that push happening; if approval is withheld, the note's `### Consequences` cites a tag that does not exist on the remote.
- Fix: Add to `plan.md` task 1: "If the nested `pnpm-workspace.yaml` does not hold the isolation, fall back to `pnpm install --ignore-workspace` inside the spike and re-run the same `git status` proof; if that also fails, stop and report." Add to task 11: "If the tag push is not approved, record the local tag's commit SHA in the note's `### Consequences` instead of the tag name, and say that the branch is unpushed."

---

## Requirement Quality

#### [AMBIGUOUS_REQUIREMENT] BLOCKER

- Location: `plan.md` § The four evaluation axes; § Implementation Tasks task 10; § Requirements row "The note recommends exactly one structure"
- Issue: the plan never states the rule that turns four measurements into one recommendation, and three of the four axes already carry their answer in the plan's own prose. Axis 1's LOC comparison is decided by construction — task 3 mandates arm A use "direct `SessionStorePort.save`/`load` throughout, **no abstraction over them**", while arm B must implement a five-member abstract class, so the comparison is "no abstraction" against "a required abstraction"; the concept-count cell even pre-writes arm B's answer ("expect `Checkpoint`, `CheckpointTuple`, `CheckpointMetadata`, `PendingWrite`, `serde`, `thread_id`, `checkpoint_ns`, `checkpoint_id`, channel versions") against arm A's un-prefilled "enumerate". Axis 2's binary is already answered in § Impact ("`Kein Agent-Framework in der Domäne` is `fest`"). Axis 4's dependency weight is pre-known. Axis 3 is by the plan's own admission not measurable by one round. Task 10 then says only "weigh" — no weighting, no thresholds. `decision-log.md` [12] names exactly this failure mode ("how spikes ratify the conclusion their author already held") but its countermeasure — finish both arms before judging — does not touch a pre-loaded metric set. The result is an ADR recorded `Accepted` and declared irreversible in practice ("Reversing the choice after M7 means rewriting the question-tree model") whose conclusion no measurement could have changed. There is also a live tension with the plan's own "estimate nothing" rule: axis 3 is an estimate the plan mandates.
- Fix: Add a new subsection `#### The decision rule` to `plan.md` § Decision, written **before** implementation starts and stating (a) the weight of each axis, (b) the concrete conditions under which the note recommends LangGraph.js — for example: arm B's checkpointer lands under N LOC, keeps `InterviewState` v1 with `schemaVersion` as the on-disk shape, the guardrail-compliant binding completes inside its 200-LOC budget, and axis 3's probes favour `StateGraph` — and (c) the conditions under which it recommends hand-rolled. State that if no LangGraph-favouring condition is reachable by construction, the axis is not decision-relevant and must be recorded as such rather than counted. Add to task 10: "Cite the decision rule by name and show each axis's measured value against its stated threshold." Reclassify axis 3 in § The four evaluation axes as "extrapolation, excluded from the estimate-nothing rule and weighted last".

#### [COMPLETENESS_GAP] ADVISORY

- Location: `plan.md` § Implementation Tasks task 2 ("taking the root from `CHRYSALYST_SESSION_DIR` with a documented default"); § Verification › Manual Testing, the two live rows
- Issue: the default is never named, and the live commands never set the variable: `CHRYSALYST_LLM_MODEL=qwen3:8b node arm-a/live-ask.ts`. `packages/server/src/adapters/session-store/filesystem-session-store.ts`'s `sessionStoreConfigFromEnv` defaults `rootDir` to `join(homedir(), '.chrysalyst', 'sessions')` — the product's real session directory, already holding sessions from `004-single-question-walking-skeleton`. If the spike's store factory reuses that helper, four live runs write spike sessions into the user's real store. § Layout promises `~/.chrysalyst-spike/<arm>/<id>/` but nothing in the tasks or the commands enforces it.
- Fix: In `plan.md` task 2, replace "with a documented default" with "defaulting to `~/.chrysalyst-spike/<arm>` and never to `sessionStoreConfigFromEnv`'s `~/.chrysalyst/sessions`, so no spike run touches the product's session directory". Prefix `CHRYSALYST_SESSION_DIR=~/.chrysalyst-spike/arm-a` (and `arm-b`) to all four live commands in § Verification › Manual Testing.

#### [COMPLETENESS_GAP] ADVISORY

- Location: `plan.md` § The four evaluation axes › Axis 2 ("Record the transitive dependency count and the installed size of each arm's `node_modules`"); § Verification › Manual Testing row "Axis 2", `du -sh node_modules` per arm
- Issue: the metric is not measurable under the layout the plan chose. § Layout puts `arm-a/` and `arm-b/` inside one `spike/engine-structure/` project with one `package.json`, one lockfile, and one `node_modules`. There is no per-arm `node_modules` to `du`. Arm A adds nothing; arm B's `@langchain/*` tree is the only delta, and a single `du -sh node_modules` measures both arms plus the shared toolchain.
- Fix: In `plan.md` § The four evaluation axes › Axis 2, replace "the installed size of each arm's `node_modules`" with "the installed size the `@langchain/*` dependencies add, measured as `du -sh node_modules` before and after adding them to `spike/engine-structure/package.json`". Change the § Verification › Manual Testing "Axis 2" command to the same before/after pair, and move that measurement into task 1 so the baseline is captured before arm B's dependencies are installed.

#### [AMBIGUOUS_REQUIREMENT] ADVISORY

- Location: `plan.md` § Impact › "Promote exactly one decision"; § Implementation Tasks task 10
- Issue: the ADR format is under-specified against the file it points at. The plan names the field set — "`**ID:**` / `**Plan:**` / `**Status:**` / `### Context` / `### Decision` / `### Options Considered` / `### Consequences`" — but omits two structural elements `specs/_decision/004-single-question-walking-skeleton.md` actually uses: the file's `# Decisions: <plan-name>` title and the `## ADR: <title>` heading each record sits under. It also never states the `**ID:**` slug value for this ADR, which is the field `recorder-agent` needs and cannot derive.
- Fix: In `plan.md` § Impact › "Promote exactly one decision" and in task 10, state the full skeleton: file title `# Decisions: engine-structure-spike`, one section `## ADR: <the chosen structure, as a statement>`, then `**ID:** engine-structure-<handrolled|langgraph>`, `**Plan:** engine-structure-spike`, `**Status:** Accepted`, then the four `###` sections.

---

## Task Breakdown

#### [TASK_GRANULARITY] ADVISORY

- Location: `plan.md` § Parallelization, "Groups B and C share no file and neither imports the other, so they run concurrently"
- Issue: the file-level claim holds, but the resource-level one does not. Task 4 and task 8 both require "a running Ollama holding `qwen3:8b`", and the plan names one host with one model pulled (§ Dependencies: "`llama3.2:3b` … is not pulled on this host"). Two concurrent live rounds against one Ollama instance with an 8B model contend for the same loaded context; at best they serialize, at worst one run's first-token latency or a load failure gets recorded as a structural difference between the arms. That is the exact confound § Non-Goals tries to avoid ("re-measuring it here would compare two harnesses, not two structures").
- Fix: Add a line to `plan.md` § Parallelization: "Tasks 4 and 8 both drive the single local Ollama and MUST NOT run concurrently; serialize the two live runs even when Groups B and C otherwise overlap." No task renumbering needed.

Task decomposition is otherwise sound: eleven tasks, each with a named artifact and a stated proof, `[expert]` applied to the four tasks that carry judgement rather than transcription, and the Group A → {B, C} → D ordering is justified by `decision-log.md` [12]. Task 5's internal breadth (thread-id mapping, tuple reconstitution, `putWrites`, `list`) is large for one unit, but it is one indivisible design question and is addressed by the stop rule requested in the Feasibility blocker above rather than by a split.

---

## Design Depth

[no objection — axis checked: no production module, interface, or boundary is created; § Non-Goals and § Dead Code Removal confine every artifact to a branch that is never merged, and `packages/core`'s dependency direction is preserved structurally rather than by convention — `spike/` sits outside the `packages/*` glob in `pnpm-workspace.yaml`, so `tests/workspace.test.ts:210` and `:297` stay green unedited. The one design-shaped concern — that arm A is mandated to carry no abstraction while arm B must build one, which predetermines the axis-1 comparison — is raised under Requirement Quality rather than duplicated here.]

---

## Prose Quality

#### [PROSE_BLOAT] ADVISORY

- Location: `plan.md`, throughout — § Summary, § This is a throwaway spike, § Design › Context, § Goals, § Non-Goals, § Layout, § Patterns, § Consequences, § Features, § Impact, § Requirements, § Dead Code Removal, § Verification › Scenario Coverage
- Issue: three facts are restated in thirteen places: "no spike code reaches `main`", "no spec delta is authored", and "`packages/` and `tests/` stay untouched". § This is a throwaway spike states all three; § Goals restates them as goals; § Non-Goals restates them as non-goals; § Requirements restates them as requirements; § Dead Code Removal restates the first; § Features and § Verification › Scenario Coverage each restate the second. The `speq plan validate` note alone appears four times (§ This is a throwaway spike, § Features twice, § Verification › Checklist). This violates the terseness guardrail and, more practically, makes it harder to see which statement is the normative one when two disagree — which is exactly what happened in the Feasibility blocker, where § Requirements and § This is a throwaway spike give opposite answers on whether arm B must produce a working round.
- Fix: In `plan.md`, keep § This is a throwaway spike as the single normative home for the three facts. Cut the duplicate bullets from § Goals (bullet 4), § Non-Goals (bullets 1 and 2), and the `speq plan validate` sentences from § Features and § Verification › Checklist, replacing each with a pointer: "See § This is a throwaway spike." Leave § Requirements and § Dead Code Removal intact — they are checkable rows rather than prose.

Writing is otherwise strong: statement headings form a scan path, § Summary holds to two sentences, normative statements use ALL-CAPS `MUST` sparingly and correctly, and every table cell names an actor. No `[PROSE_UNCLEAR]` finding — no sentence required a second read to resolve.

---

## Verified Without Objection

Checked against the repository and found accurate; recorded so round 2 need not re-verify:

- The four `/speq:record` roadmap line references are correct: `specs/roadmap.md:44` (`**Engine-Struktur**` guardrail, `offen — Spike in M3`), `:59` (`| M3 | … | ⬜ offen |`), `:232–233` (M7's "gebaut in der in M3 entschiedenen Struktur (hand-gerollt oder LangGraph.js)"), `:455` (§ Querschnittsthemen `**Engine-Struktur**`). `grep -n 'teilweise\|🟡' specs/roadmap.md` returns nothing — the plan's assertion that no intermediate marker needs removal holds. § M3's own section (lines 150–173) carries no status marker, so four edits is the right count.
- The `*.live.test.ts` collision is correctly diagnosed. `tests/workspace.test.ts:191` is verbatim `const liveTestFiles = filesUnder('', (name) => name.endsWith('.live.test.ts'));`, and `filesUnder` skips only `node_modules`, `dist`, `coverage`, and dot-directories. The `*.spike.test.ts` rename avoids it, and `specs/platform/monorepo-workspace/spec.md` § "Live-tier tests are gated by an environment flag" is not contradicted.
- The lint and format collisions are real and the fixes land on branch-only files. `eslint.config.js` has a global `ignores: ['**/dist/**', '**/coverage/**', '**/.claude/**']` array that accepts `'spike/**'`; `.prettierignore` exists and accepts `spike/`; root `lint` is `eslint .` and `format:check` is `prettier --check .`, both repo-wide.
- The non-collisions are also correct: root `vitest.config.ts` sets `include: ['tests/**/*.test.ts']`, so no `spike/` file is collected by `pnpm -r --include-workspace-root test`; root `typecheck` is `pnpm -r typecheck`, which reaches only the three workspace packages. Exactly two `*.live.test.ts` files exist, matching the Checklist's "both … report as skipped".
- The isolation mechanism is sound in principle. `pnpm-workspace.yaml` globs `packages/*` only, `.gitignore` covers `node_modules/`, there is no `.npmrc` to interfere, and pnpm stops its workspace-root search at the first `pnpm-workspace.yaml` it finds walking up. Task 1 states the precondition check and shows both proofs. The missing piece is a fallback, raised as an ADVISORY above.
- `packages/server/package.json` declares no `exports` field, so the deep paths the plan names are reachable; `packages/core/package.json` exports `"." : "./src/index.ts"` alone, and the plan correctly imports only the barrel from core and copies `OPENING_SYSTEM_PROMPT`, which is a module-private `const` in `packages/core/src/interview/single-turn-interview.ts` and not exported.
- All five specs listed as consumed unchanged exist in the library: `platform/session-store-port`, `adapters/filesystem-session-store`, `adapters/ollama-llm-adapter`, `interview/single-question-interview`, `platform/monorepo-workspace`.
- `CHRYSALYST_SESSION_DIR`, `CHRYSALYST_LLM_BASE_URL`, and `CHRYSALYST_LLM_MODEL` are the real env-var names; `createFilesystemSessionStore`, `sessionStoreConfigFromEnv`, and `createOpenAiCompatibleLlm` are the real exported factories.
- The guardrail-collision requirement the orchestrator flagged is present and normative in two places: § Impact ("the note MUST say so explicitly and name the placement it proposes instead — `packages/server`, or a fourth package with the invariant edits that implies") and task 10. No finding.
- Zero spec deltas is settled by the interview and is not raised as a defect.
