# Code Review Findings: llm-backend-setup-gate

## Summary

- Files reviewed: 30 (21 modified, 9 new)
- Total findings: 5 (standard: 4, expert: 1)

Verification run before review (evidence for the Evidence Rule):
`pnpm -r --include-workspace-root test` — core 78 passed, server 89 passed / 5 skipped,
web 431 passed, 0 failures; `pnpm lint` — clean; `pnpm format:check` — clean;
`pnpm typecheck` — clean.

## Reviewed and cleared

Not findings. Recorded so no implementer re-opens them.

- **`App.tsx`'s `if (controller.signal.aborted) return;` guard stays.** It is the
  supersede rule task 10 mandates, and it is not dead in the shipped app: `main.tsx`
  wraps `<App>` in `StrictMode`, whose double-invoked mount effect runs the cleanup
  and re-runs the effect while the component is still mounted — exactly the
  supersede case. Without the guard the first probe's answer would still be written
  to state there, and a first and second answer that disagreed would land in
  arrival order rather than newest-wins. It is unfalsifiable in `App.test.tsx` only
  because Testing Library renders without `StrictMode`. Do not remove it and do not
  add a test that pretends to cover it.
- **`StrictMode`'s two `GET /status` requests per `pnpm dev` page load are not a
  defect in this plan's code.** The cleanup aborts the first controller and the
  guard drops its answer, so the second probe decides the screen; the shipped
  `InterviewView` session effect has the same shape. Nothing here to fix.

## Standard fixes

### packages/web/src/setup/backend-status.ts

#### [OUTDATED_COMMENT] Two doc comments are attached to the wrong symbols

- Location: lines 1-21 and lines 25-26
- Issue: the twenty-line block at the top of the file describes the module (the
  wire shape, the fixture agreement, the untranslated-rejection boundary) but sits
  immediately above `export type BackendFault`, so TypeScript binds it as
  `BackendFault`'s doc comment — an editor hovering `BackendFault` gets the module
  essay, and `BackendFault` itself is left undocumented. The sentence that *does*
  describe the faults, `/** The two things a person can act on, told apart because
  the actions differ. */`, sits on `BackendReadiness` instead, where it describes
  something else: `BackendReadiness` is the whole answer, ready outcome included,
  not "the two things a person can act on". The server twin,
  `packages/server/src/backend-readiness.ts` line 17, has that same sentence on
  `BackendFault`, which is where it belongs — the web copy is the one that slipped.
- Fix: In packages/web/src/setup/backend-status.ts, move the sentence
  `/** The two things a person can act on, told apart because the actions differ. */`
  from above `BackendReadiness` (line 25) to directly above `export type BackendFault`
  (line 21), matching packages/server/src/backend-readiness.ts. Convert the file's
  opening block (lines 1-20) into a detached module comment by changing its `/**`
  opener to `/*` and leaving a blank line between it and the `BackendFault`
  declaration, so it no longer binds to a symbol. Give `BackendReadiness` its own
  one-line doc comment stating that it is the status route's answer: ready, or
  blocked with the fault that stops it.

#### [CONTEXTLESS_ERROR] A 200 answer that is not JSON rejects with a platform message naming neither the route nor the attempt

- Location: line 58, `const payload: unknown = await response.json();`
- Issue: `fetchBackendReadiness`'s own doc comment (lines 43-48) promises it
  rejects "when the route answers anything this package cannot read — an
  unreachable server, a status other than `200`, or a malformed body". Every
  branch keeps that promise except this one: a `200` whose body is not JSON at all
  (a dev proxy misconfigured onto the SPA fallback, an intercepting portal, an
  HTML error page) rejects with the platform's raw `SyntaxError` — e.g.
  `Unexpected token '<', "<!doctype "... is not valid JSON` — which names neither
  `GET /status` nor what was being attempted. `App.tsx` then renders that string
  verbatim on the setup screen as the whole explanation, which is the opposite of
  the guidance this milestone exists to give. The three sibling readers
  (`readBoolean`, `readString`, `readReason`, lines 79-110) all name the field and
  echo the payload, so this is the one reader out of four that does not. It is also
  the one malformed-body shape `backend-status.test.ts` never exercises — the suite
  covers a non-200 status, a non-boolean `ready`, a non-string `backend`, a
  non-string `model`, an absent `reason` and an unknown `reason`, but no
  unparseable body.
- Fix: In packages/web/src/setup/backend-status.ts, wrap the `await response.json()`
  call in `fetchBackendReadiness` in a `try`/`catch (cause)` and, on failure, throw
  `new Error(\`The status response was not JSON: GET ${STATUS_ROUTE} answered ${String(response.status)}\`, { cause })`;
  assign the parsed value to `payload` on the success path and keep passing it to
  `toBackendReadiness` unchanged. Then add a test to
  packages/web/src/setup/backend-status.test.ts in the `fetchBackendReadiness`
  describe block, named
  `rejects a 200 answer whose body is not JSON, naming the route`, that uses
  `recordingFetch` to answer `new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } })`
  and asserts the rejection message contains `GET ${STATUS_ROUTE}`.

### packages/web/src/vite-config.test.ts

#### [VAGUE_TEST_NAME] The proxy test names the interview prefix it never asserts

- Location: lines 21-27
- Issue: the test is named `"routes the status route and the interview prefix to
  the API's loopback address"` but its body asserts only `/status`; nothing in it
  touches `/interview`. Half the name states a condition the test cannot fail on.
  That name is also the one plan.md § Verification maps the
  `platform/backend-setup-gate` proxy scenario to, and the plan's § Features note
  states the reason both prefixes belong in one assertion: `interview-view`'s
  dev-proxy scenario requires the table to keep routing the interview prefix, and
  the point of this scenario is that adding a second entry does not falsify it.
  As written, a change that added `/status` while dropping `/interview` from the
  table would leave this test green.
- Fix: In packages/web/src/vite-config.test.ts, extend the test at line 21 so its
  body matches its name: after the existing `/status` assertions, add
  `expect(Object.keys(proxy ?? {})).toContain('/interview');` and
  `expect(proxy?.['/interview']).toBe('http://127.0.0.1:3000');`. Leave the
  pre-existing test at line 13 and the `/health` test at line 29 exactly as they
  are.

### packages/server/src/routes/interview-routes.test.ts

#### [SHRINKABLE] The dead-backend double adds a second call-recording mechanism beside the one the file already has

- Location: lines 123-155 (the `DeadBackendLlm` interface and `deadBackendLlm`),
  asserted at lines 683-684
- Issue: `FakeLlm` (line 86) already carries `readonly requests: LlmRequest[]` as
  this file's single way of recording that a model double was asked for inference —
  `chunkedLlm` pushes into it from `stream` (line 110), and `rejectingLlm` does the
  same. `deadBackendLlm` instead declares `requests: []`, never pushes into it, and
  introduces a whole extra interface plus two mutable booleans (`completeCalled`,
  `streamCalled`) to record the identical fact, so the file now has two answers to
  "was inference reached". The unused `requests` array is the trap: it is
  permanently empty regardless of what the route did, so a later test that asserts
  `deadLlm.requests` against this double would assert nothing and pass.
- Fix: In packages/server/src/routes/interview-routes.test.ts, delete the
  `DeadBackendLlm` interface (lines 123-126) and change `deadBackendLlm` to return
  `FakeLlm`. Drop the `completeCalled` and `streamCalled` fields; give the function a
  local `const requests: LlmRequest[] = []` assigned to the double's `requests`
  field, and have both `complete` and `stream` push their `request` argument into it
  before rejecting, exactly as `chunkedLlm` does at line 110. Replace the assertions
  at lines 683-684 with a single `expect(deadLlm.requests).toEqual([]);`.

## Expert fixes

### packages/web/src/App.tsx

#### [MISSING_BOUNDARY_TEST] The second half of a re-check drops keyboard focus onto `<body>`

- Location: packages/web/src/App.tsx lines 104-121 (the focus effect, the
  `rechecked` ref and `checkAgain`) and lines 149-168 (the gate render); the test
  that covers only the first half is packages/web/src/App.test.tsx lines 466-514
- Issue: the re-check is two transitions and only the first one manages focus.
  `checkAgain` sets `rechecked.current = true`, the effect at line 104 focuses the
  checking `<section>`, and `App.test.tsx` line 497 asserts that. When the second
  probe answers with a fault, the ternary at line 150 swaps that `<section>` for
  `<SetupGuide>` — different element types, so React unmounts the focused node —
  and focus reverts to `<body>`. The person who pressed `Check again` from the
  keyboard, and whose backend is still down, is left on `<body>` with the new
  guidance and the check control below them, having to tab from the top of the
  document to try again. That is the exact failure plan.md task 10 names —
  "a person operating the screen by keyboard is dropped onto `<body>` and hears
  nothing" — and the direction contract's § Constraints demands focus management
  across "both directions of the swap". No test covers this transition: the only
  re-check test that reaches a second answer (`re-probes on the check control and
  mounts the view on the second answer`, line 432) answers ready, so the guidance
  never comes back and the transition is never exercised. The polite live region is
  unaffected and keeps working; this is focus alone.
- Fix: In packages/web/src/setup/SetupGuide.tsx, add
  `readonly controlRef?: Ref<HTMLButtonElement>;` to `SetupGuideProps` (importing
  `type Ref` from `react`), document it in one line as the seam the shell uses to
  return focus to the control after a re-check, and pass it as `ref={controlRef}` on
  the existing `<button>`. In packages/web/src/App.tsx, replace the
  `rechecked` boolean ref with `const focusStep = useRef<'none' | 'checking' | 'control'>('none')`
  and add `const recheckControl = useRef<HTMLButtonElement>(null)`; have `checkAgain`
  set `focusStep.current = 'checking'`; rewrite the effect at lines 104-108 so that
  when `gate.kind === 'checking' && focusStep.current === 'checking'` it focuses
  `checking.current` and sets `focusStep.current = 'control'`, and when
  `gate.kind !== 'checking' && gate.kind !== 'ready' && focusStep.current === 'control'`
  it focuses `recheckControl.current` and sets `focusStep.current = 'none'`; leave
  the `[gate]` dependency list as it is, and pass `controlRef={recheckControl}` to
  `<SetupGuide>` at line 162. Then add a test to packages/web/src/App.test.tsx named
  `returns focus to the check control when the guidance replaces a re-check's checking state`
  that renders `<App>` with `probeBackend={answering(blockedBy('unreachable'), blockedBy('unreachable'))}`,
  flushes, clicks the control, asserts `document.activeElement` is the checking
  region, flushes again, and asserts `document.activeElement` is
  `within(root).getByRole('button', { name: uiStrings.en.setupRecheck })`. Every
  assertion already in App.test.tsx, including line 497, MUST stay green unedited.
