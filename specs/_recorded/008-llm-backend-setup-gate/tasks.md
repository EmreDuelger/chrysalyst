# Tasks: llm-backend-setup-gate

## Group A

- [x] 1. Status wire fixture — `tests/fixtures/backend-status.json` + `tests/fixtures/README.md` section

## Group B (ordered stream, packages/server)

- [x] 2. Red then green — `llmBackendNameFromEnv` in `openai-compatible-llm.ts`
- [x] 3. Red — status route scenarios in `backend-readiness.test.ts` + `client.test-d.ts` [expert]
- [x] 4. Green — `backend-readiness.ts`, `/status` route, `createApp(deps, backend)` across 6 call sites [expert]
- [x] 5. Red then green — `backendDescriptorFromEnv` in `composition.ts`
- [x] 6. Red then green — stored session outlives dead backend (`interview-routes.test.ts`)

## Group C (ordered stream, packages/web)

- [x] 7. Red then green — `packages/web/src/setup/backend-status.ts` + test
- [x] 8. Red then green — setup dictionary entries in `strings.ts`, `en.ts`, `de.ts`
- [x] 9. Red then green — `SetupGuide.tsx` + `SetupGuide.module.css` + test
- [x] 10. Red then green — shell's gate in `App.tsx` / `App.test.tsx` [expert]

## Group D

- [x] 11. Dev-server proxy — `vite.config.ts` + `vite-config.test.ts`

## Group E (after Group B)

- [x] 12. Live tier — `backend-readiness.live.test.ts` against a real daemon

## Group F (after Group C)

- [x] 13. Styling of the setup screen against the direction contract (impeccable finish round)

## Group G (after A–F)

- [x] 14. Run full Verification checklist end to end, including Manual Testing and live row

## Phase 4: Review Fixes

- [x] 4.1 In packages/web/src/setup/backend-status.ts, move the sentence `/** The two things a person can act on, told apart because the actions differ. */` from above `BackendReadiness` to directly above `export type BackendFault`, matching packages/server/src/backend-readiness.ts; convert the file's opening block into a detached module comment (`/**` → `/*`, blank line before the `BackendFault` declaration); give `BackendReadiness` its own one-line doc comment stating it is the status route's answer: ready, or blocked with the fault that stops it.
- [x] 4.2 In packages/web/src/setup/backend-status.ts, wrap `await response.json()` in `fetchBackendReadiness` in a `try`/`catch (cause)` and on failure throw `new Error(\`The status response was not JSON: GET ${STATUS_ROUTE} answered ${String(response.status)}\`, { cause })`; keep the success path passing the parsed payload to `toBackendReadiness` unchanged. Add a test to packages/web/src/setup/backend-status.test.ts in the `fetchBackendReadiness` describe block named `rejects a 200 answer whose body is not JSON, naming the route` using `recordingFetch` to answer `new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } })` and asserting the rejection message contains `GET ${STATUS_ROUTE}`.
- [x] 4.3 In packages/web/src/vite-config.test.ts, extend the test named "routes the status route and the interview prefix to the API's loopback address" so its body matches its name: after the existing `/status` assertions add `expect(Object.keys(proxy ?? {})).toContain('/interview');` and `expect(proxy?.['/interview']).toBe('http://127.0.0.1:3000');`. Leave the other two tests unedited.
- [x] 4.4 In packages/server/src/routes/interview-routes.test.ts, delete the `DeadBackendLlm` interface and change `deadBackendLlm` to return `FakeLlm`; drop `completeCalled`/`streamCalled`, give the function a local `const requests: LlmRequest[] = []` assigned to the double's `requests` field, and have both `complete` and `stream` push their `request` argument into it before rejecting, exactly as `chunkedLlm` does. Replace the assertions at lines 683-684 with a single `expect(deadLlm.requests).toEqual([]);`.
- [x] 4.5 In packages/web/src/setup/SetupGuide.tsx, add `readonly controlRef?: Ref<HTMLButtonElement>;` to `SetupGuideProps` (importing `type Ref` from `react`), document it in one line as the seam the shell uses to return focus to the control after a re-check, and pass it as `ref={controlRef}` on the existing `<button>`. In packages/web/src/App.tsx, replace the `rechecked` boolean ref with `const focusStep = useRef<'none' | 'checking' | 'control'>('none')` and add `const recheckControl = useRef<HTMLButtonElement>(null)`; have `checkAgain` set `focusStep.current = 'checking'`; rewrite the focus effect so that `gate.kind === 'checking' && focusStep.current === 'checking'` focuses `checking.current` and sets `focusStep.current = 'control'`, and `gate.kind !== 'checking' && gate.kind !== 'ready' && focusStep.current === 'control'` focuses `recheckControl.current` and sets `focusStep.current = 'none'`; keep the `[gate]` dependency list and pass `controlRef={recheckControl}` to `<SetupGuide>`. Add the test `returns focus to the check control when the guidance replaces a re-check's checking state` to packages/web/src/App.test.tsx, leaving every existing assertion unedited. [expert]
