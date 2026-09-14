---
version: 1
slug: "packages-web-src-setup-setupguide-tsx"
primary_target: "packages/web/src/setup/SetupGuide.tsx"
related_targets: ["packages/web/src/App.tsx","packages/web/src/interview/InterviewView.tsx"]
---

## Scope & mode

Surface: the backend setup screen (`packages/web/src/setup/SetupGuide.tsx`) — roadmap M6. Mode: **Operate** — the visitor clears one blocker and moves on; scanability and familiar affordance outrank expression. Renders in place of `InterviewView` inside `App.tsx`'s shell, below the unchanged masthead, in the same ~40rem column. Props in, markup out — no fetch, no state.

## Audience, job, action

The same non-technical founder from `InterviewView`'s brief, now blocked before the interview starts. Job: understand why, and what to do. Action: start the named backend or install the named model, then press "Check again" or reload.

## Constraints

- WCAG 2.2 AA: both directions of the swap announced to assistive technology — fault text when it replaces the checking state, and the checking state when it replaces the guidance on a re-check, where it also takes the focus the removed check control held; check control has an accessible name, visible focus, keyboard operability; contrast ≥ 4.5:1; the raw failure message stays legible at its worst case (a long English sentence on a German page).
- No new token, no new face, radius ≤ 2px, no card, no shadow — `packages/web/DESIGN.md`'s world, unchanged.
- No motion: the shell has none, and this screen adds none.
- Backend name and model name are values rendered as they arrive, never copy.

## Direction contract

THESIS: A guidance screen, not an error dialog — it takes the Inline Error's already-established calm register (hairline rule, single vermilion mark, plain sentence) and gives it the whole page instead of a corner, refusing both the alarm-red banner and the spinner-with-apology this fault usually gets.

OWN-WORLD: Inherited from `packages/web/DESIGN.md` unchanged — the same five tokens, the same two voices, the same flat, no-card, no-shadow world. Structure is hairline rules and space, exactly as the shipped surface already proves.

STORY: The visitor understands chrysalyst is waiting on their own machine, not broken; sees which of two faults applies and the one sentence that tells them what to do; presses "Check again" (or reloads) and the interview appears.

FIRST VIEWPORT: Masthead unchanged at top. Below it, the same column: a tracked kicker (`SETUP`) over one weighted fault line — Question-Standfirst register, sized down from 28px since this is a sentence, not a standfirst — naming the backend and the fault; a Libre Franklin action sentence beneath it naming the fix; the `Check again` control set exactly like `Record answer →` (vermilion text link, no chrome). Checking state occupies that same block, one tracked label, non-blinking (nothing streams), so the swap to guidance does not jump. The failure state reuses Inline Error verbatim: hairline top rule, 2px vermilion left rule, translated label over the raw message in Caption type.

FORM: Extends the established world as a new full-page state beside `InterviewView`, not a new identity — content and states were already fixed by the brief, so this is shaped directly, no concept tournament. Code-led: no image generation is available in this harness, so no comp; ambition is carried by this contract's FIRST VIEWPORT block and the reused Inline Error / Standfirst vocabulary, audited in behaviour at the finish review.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md's sidecar, and every shipping raster carrying its provenance.

## Memorable moment

The fault line reading exactly like the question it is standing in for — same weight, same column, same calm — so the person recognises the page's own voice telling them what's wrong, rather than a system dialog interrupting it.

## Unresolved

- Whether the fault line takes the accent colour the interview's submit control owns, or stays ink — the two are never on screen together, decided at build time against the shipped Inline Error precedent.
- Whether the checking state's placeholder is a bare label or already reserves the two-line height the guidance will fill — build-time call, checked against both fault variants (one line vs. two) so neither jumps.
- Exact vertical position of the `Check again` control relative to the action sentence — inherits `Record answer →`'s right-aligned actions-row placement unless the finish review flags a mismatch.
