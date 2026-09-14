# Decisions: change-language-switch-restarts-interview

## ADR: The restart lives in the view, not in the shell

**ID:** restart-owned-by-interview-view-not-shell
**Plan:** change-language-switch-restarts-interview
**Status:** Accepted

### Context

A language switch during an open interview round now has to decide whether to restart the round, and that decision depends on state — the typed draft and the current phase — that only `InterviewView` holds. `App.tsx` owns the chrome's language but knows neither.

### Decision

`InterviewView` owns the restart and the confirmation. `App.tsx` is not edited: it keeps owning the chrome's language, keeps remembering it, and keeps handing it down as a prop.

### Options Considered

| Option | Verdict |
|--------|---------|
| Decision lives in `InterviewView` | ✓ Chosen — the view already holds the draft and the phase; no state needs to move |
| `App` remounts the view with `key={locale}` | ✗ Rejected — restarts unconditionally and discards the draft silently |
| `App` asks the view for permission before committing a language | ✗ Rejected — inverts the dependency and forces the shell to mirror the view's phase and draft upward |

### Consequences

`platform/web-shell`'s contract with the view stays one prop; no callback or `key` is added to `App.tsx`. A later milestone touching the restart logic edits one file instead of two.

## ADR: The restart trigger reads the language the round was started for, never the language the response named

**ID:** restart-trigger-reads-round-locale-not-session-locale
**Plan:** change-language-switch-restarts-interview
**Status:** Accepted

### Context

`interview/interview-view` deliberately has the view take a session's language from its creation response rather than from the value it sent, so the two are allowed to differ. A restart trigger has to compare the chrome's current language against something, and comparing against the wrong side of that pair loops: create in `de`, response says `en`, restart in `de`, response says `en`, forever.

### Decision

The gate compares the chrome's language against `round.locale` — the value passed to `createSession` — and never against `session.locale`, which comes back from the creation response.

### Options Considered

| Option | Verdict |
|--------|---------|
| Compare against `round.locale` (the language asked for) | ✓ Chosen — the loop is unreachable by construction, because the value never changes in response to the API's answer |
| Compare against `session.locale` (the language the response named) | ✗ Rejected — reads as the more direct statement of "the interview is in the wrong language," but restarts forever whenever the API answers with a language it was not asked for |

### Consequences

The comparison needs no guard against its own output; a test double that echoes back a fixed language regardless of what it was asked catches a regression to the rejected option.

## ADR: The confirmation is an inline request in the answer block

**ID:** language-restart-confirmation-inline-not-modal
**Plan:** change-language-switch-restarts-interview
**Status:** Accepted

### Context

Restarting the interview can discard a typed draft, so the view has to ask before doing so. The confirmation's mechanism has to fit `packages/web/DESIGN.md`'s existing constraints (Flat-Forever, No-Box, One Red Rule) and has to keep the draft it is asking about visible while the person decides.

### Decision

The request renders below the answer form as an inline block: an `aria-hidden` label, an assertive `role="alert"` prompt sentence, and two Action-type controls in a right-aligned row. It takes no vermilion; the single accent on screen stays `Record answer →`.

### Options Considered

| Option | Verdict |
|--------|---------|
| Inline request in the answer block | ✓ Chosen — keeps the draft at risk visible while the person decides, and fits the existing flat, box-free design system |
| `window.confirm` | ✗ Rejected — renders in the browser's language rather than the one just chosen, and is unstyleable and untestable through the DOM |
| A modal `<dialog>` | ✗ Rejected — wrong affordance: a modal protects a screen the person can no longer safely read, but the content at risk here is exactly what they should be reading. `DESIGN.md`'s Flat-Forever and No-Box rules also leave no legal way to draw one |

### Consequences

No new surface contract is needed — the confirmation is one component added inside the existing `InterviewView.tsx` contract. The vermilion allocation stays unambiguous: the loudest element is always the action that saves the person's work.

## ADR: A confirmation whose subject is destroyed resolves in favour of the action it guarded

**ID:** emptied-draft-restarts-rather-than-cancels
**Plan:** change-language-switch-restarts-interview
**Status:** Accepted

### Context

While the discard confirmation is on screen, the person can edit the draft it is asking about down to blank instead of answering `Keep` or `Discard`. Plan-review round 2 found the plan asserted two contradictory rules for this case with no tiebreaker: one said emptying the draft restarts immediately, the other said it merely withdraws the request. The question was put to the user, who chose restart.

### Decision

Emptying the answer field while the request is on screen withdraws the request and then restarts the interview in the chosen language immediately, without asking again. The restart fires as an event from the answer field's `onChange`, guarded on `locale !== round.locale`, so it cannot loop and cannot fire from a standing condition.

### Options Considered

| Option | Verdict |
|--------|---------|
| Emptying the draft restarts the interview | ✓ Chosen — the only thing the request protected is gone, so nothing is left to decide; the alternative leaves the chrome and the interview in different languages indefinitely with no way back except toggling the control away and back |
| Emptying the draft declines the restart | ✗ Rejected — leaves an unexplainable stuck state: no request on screen, nothing restarted, and no visible path to fix it |

### Consequences

This inverts the conventional reading of a confirmation — normally, a request that leaves the screen unanswered cancels the action it guarded. Here, a request whose subject the person destroys resolves in favour of the action, because the subject was the only thing it protected. A later planner adding any confirmation to this codebase should treat this ADR as the precedent, not re-litigate it from scratch.
