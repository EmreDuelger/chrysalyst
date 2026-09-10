---
name: chrysalyst web
description: Editorial-minimalist browser client for a guided product-spec interview
colors:
  ground: '#f4f1ea'
  ink: '#1a1a1a'
  ink-soft: '#55524b'
  accent: '#c8402b'
  rule: '#d8d2c4'
typography:
  question:
    fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif"
    fontSize: '1.75rem'
    fontWeight: 400
    lineHeight: 1.32
    letterSpacing: '-0.003em'
  wordmark:
    fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif"
    fontSize: '1.0625rem'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '0.01em'
  body:
    fontFamily: "'Libre Franklin', 'Helvetica Neue', Arial, sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  caption:
    fontFamily: "'Libre Franklin', 'Helvetica Neue', Arial, sans-serif"
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 'normal'
  action:
    fontFamily: "'Libre Franklin', 'Helvetica Neue', Arial, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: '0.04em'
  label:
    fontFamily: "'Libre Franklin', 'Helvetica Neue', Arial, sans-serif"
    fontSize: '0.6875rem'
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: '0.16em'
rounded:
  none: '0'
  max: '2px'
spacing:
  hairline-gap: '0.65rem'
  tight: '1rem'
  section: '1.5rem'
  major: '2.5rem'
  writing-baseline: '1.75rem'
components:
  submit-control:
    backgroundColor: 'transparent'
    textColor: '{colors.accent}'
    typography: '{typography.action}'
    rounded: '{rounded.none}'
    padding: '0.35rem 0'
  submit-control-disabled:
    backgroundColor: 'transparent'
    textColor: '#a7a299'
    typography: '{typography.action}'
  answer-field:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.none}'
    padding: '0.35rem 0 0.5rem'
    width: '100%'
    height: '5.25rem'
---

# Design System: chrysalyst web

## Overview

**Creative North Star: "The Standfirst"**

chrysalyst's browser client is a magazine page that happens to be interactive. One
question is set like an editorial standfirst — serif, large, unhurried — and
answered in a ruled column below it. There is no chat thread and no "Step 3 of 12"
wizard chrome. Hairline rules and tracked uppercase micro-labels do all the
structural work; whitespace does the rest. The register is Monocle / Apartamento /
Études: warm paper, near-black ink, and a single editorial vermilion that is spent
only on the few marks that must be noticed.

The system is flat. No card ever wraps content, no surface casts a shadow, and
corners are square. Depth is communicated entirely by 1px rules in the warm
hairline tone and by the amount of air between blocks. The one place ink gives way
to colour is a state change: a focused field, a completed save, a broken stream.

Density is low and the composition is single-column at a fixed ~40rem measure,
centred, with generous outer margin. The build ships one screen (the M3 interview
view) and one shell (the ruled topbar); every value below is taken from that
shipped code, not from the direction brief.

**Key Characteristics:**

- One serif voice for the question, one grotesque voice for everything else.
- Structure is rules and space — never boxes, never shadow.
- Vermilion is a state signal, not a brand wash.
- Uppercase tracked micro-labels (0.16em) annotate every region.
- A single ~40rem column, centred, with no responsive breakpoints.

## Colors

A warm paper-and-ink palette with one high-chroma editorial red.

### Primary

- **Editorial Vermilion** (`#c8402b`): the only chromatic colour in the system.
  Used on the `Record answer →` submit control, on the "Recorded" confirmation line
  and its top rule, on the inline error's label and 2px left rule, and as the
  focused answer field's baseline rule. It is a signal of state, never decoration.

### Neutral

- **Warm Paper** (`#f4f1ea`): the full-bleed page ground. Never boxed or panelled —
  the whole viewport is this one tone.
- **Near-Black Ink** (`#1a1a1a`): primary text — the question, the wordmark, typed
  answer text, the error message body, and the answer field's resting baseline
  rule. Roughly 15:1 on the ground.
- **Soft Ink** (`#55524b`): secondary text — every uppercase micro-label
  (`The question`, `Interview · 01`, `Your answer`), the status notes, the hint
  line, and the dimmed placeholder / frozen-question states. Roughly 7:1 on the
  ground.
- **Hairline** (`#d8d2c4`): every 1px structural rule — the topbar underline, the
  section rules above the answer block and the error, and the ruled writing lines
  inside the answer field.

### Named Rules

**The One Red Rule.** Vermilion appears on at most one element per state. If a
second thing on screen is red, one of them is wrong.

**The No-Box Rule.** Content is separated by rules and space only. A background
fill, a border on more than one side, or a rounded container is a violation of the
world.

## Typography

**Display / Question Font:** Source Serif 4 (self-hosted, weights 400/500; falls
back to Georgia, then Times New Roman)
**UI Font:** Libre Franklin (self-hosted, weights 400/500/600; falls back to
Helvetica Neue, then Arial)

Both faces are bundled from `packages/web/public/fonts/` under the SIL OFL and are
never fetched from a CDN; the 400 weights are `<link rel="preload">`ed. Source
Serif 4 400 is loaded first; Libre Franklin next.

**Character:** A transitional text serif with real editorial warmth carries the
question so it reads as considered prose, not UI copy. A Franklin-lineage grotesque
carries every label, control and status line so the machinery around the question
stays quiet and familiar.

### Hierarchy

- **Question** (Source Serif 4, 400, 1.75rem / 28px, line-height 1.32, tracking
  -0.003em): the interview question, set as a standfirst. The only large type on
  the page. During streaming it fills in token by token with a trailing cursor
  rule; when the stream fails it drops to Soft Ink at ~0.55 opacity.
- **Wordmark** (Source Serif 4, 500, 1.0625rem / 17px, tracking 0.01em): the
  `chrysalyst` wordmark in the topbar, beside the mark. The only serif UI element.
- **Body** (Libre Franklin, 400, 1rem / 16px, line-height 1.5): typed answer text.
  Inside the answer field the line-height locks to the 1.75rem writing baseline so
  text sits on the ruled lines.
- **Caption** (Libre Franklin, 400, 0.9375rem / 15px, line-height 1.55): the inline
  error message body — the one place body copy is set smaller than 1rem.
- **Action** (Libre Franklin, 600, 0.8125rem / 13px, tracking 0.04em, sentence
  case): the submit control label. Semibold and lightly tracked, not uppercase.
- **Label** (Libre Franklin, 500, 0.6875rem / 11px, tracking 0.16em, UPPERCASE):
  every micro-label and status line — the kicker above the question, the topbar
  metadata, the `Your answer` label, the streaming/connecting notes, the recorded
  confirmation, and the error label.

### Named Rules

**The Two Voices Rule.** Serif is the question and the wordmark — nothing else.
Everything a user operates or reads as interface is Libre Franklin.

**The Tracked-Label Rule.** Any label at 11px is uppercase and tracked 0.16em
(`--label-tracking`). Never track body or question text positive; the question
carries a slight negative track (-0.003em).

## Layout

A single centred column at `max-width: 40rem` (`--measure`), used by the topbar,
the interview view, and every block inside it. The shell pads `2.5rem 2rem 4rem`;
the interview view adds `2.5rem` of top padding below the topbar. There are **no
media queries** other than `prefers-reduced-motion` — below ~44rem the column
simply shrinks within the fixed 2rem side padding.

Vertical rhythm is rem-based and loosely quantised to 0.25rem, with a few recurring
steps: `0.65rem` between a label and its content, `1rem` for tight action rows,
`1.5rem` of padding below a section rule, and `2.5rem` of separation before a new
region (the answer block, the error block). Inside the answer field the writing
lines are spaced on a strict `1.75rem` baseline.

The rule sits more space above a region than below its label: `2.5rem` above the
answer block's rule, `1.5rem` below it before the `Your answer` label.

## Elevation & Depth

**No shadows. No elevation.** The system is entirely flat. `box-shadow` appears
nowhere in the shipped CSS. Depth and grouping are conveyed by 1px hairline rules
(`#d8d2c4`) and by vertical whitespace only. The single accent-coloured rule (a
focused field, the confirmation) is a state cue, not a lift.

### Named Rules

**The Flat-Forever Rule.** Surfaces never leave the page plane. If a block needs to
feel separate, add a hairline rule and more space above it — not a shadow, not a
fill.

## Shapes

Square by default: the answer field explicitly sets `border-radius: 0`, and no
other element rounds. The token layer carries `--radius: 2px` as an absolute
ceiling for any future rounded element, but nothing in the build uses it.

Borders are always exactly 1px and in the hairline tone, applied to a single edge
(`border-top` above a section, `border-bottom` under the answer field and topbar).
The two exceptions are both deliberate accent cues: the recorded confirmation's
1px `border-top` in vermilion, and the inline error's 2px `border-left` in
vermilion.

The wordmark mark is a 24x24 inline SVG rhombus — a crystalline diamond outlined at
1.5px stroke with its lower triangle filled — rendered at 15px, `currentColor`,
`aria-hidden`. It is the only geometric ornament in the system.

## Components

### Topbar

- **Character:** a ruled masthead, nothing more.
- **Layout:** flex row, `justify-content: space-between`, baseline-aligned, 40rem
  measure, `border-bottom: 1px solid var(--rule)`, `0.75rem` bottom padding.
- **Left:** the mark (15px, ink) + `chrysalyst` wordmark (serif, 17px, 500).
- **Right:** tracked metadata line `Interview · 01` (Label style, Soft Ink,
  `white-space: nowrap`).

### Question Standfirst

- **Character:** the editorial centrepiece; large serif prose.
- **Style:** Question type (28px / 1.32), Near-Black Ink, no margin.
- **Kicker:** an 11px tracked uppercase `The question` label sits `1rem` above it
  (Soft Ink, `aria-hidden`). Carried from the pinned brief; see Do's and Don'ts.
- **Streaming:** text is appended token by token into an `aria-live="polite"`
  paragraph; a cursor rule trails the text.
- **Placeholder (connecting):** Soft Ink at 0.65 opacity.
- **Frozen (failed):** Soft Ink at 0.55 opacity, cursor rule stops blinking.

### Streaming Cursor Rule (signature)

- A `0.62em` wide, 2px tall inline block in Near-Black Ink, `0.12em` left margin,
  raised `0.16em` off the baseline.
- Blinks via `cursor-blink 1.05s steps(1, end) infinite` — a hard on/off at 50%,
  no fade.
- Removed under `prefers-reduced-motion`; also rendered static (`animation: none`)
  in the failed state. This is the deliberate anti-chatbot signal: one hairline
  blinking, never bouncing dots.
- Text alternative: a visible `role="status"` note reads
  "the question is still being written".

### Ruled Answer Field

- **Character:** a sheet of ruled writing paper, not a form input.
- **Style:** full-width `<textarea>`, `min-height: 5.25rem`, `border: 0` except
  `border-bottom: 1px solid var(--ink)`, `border-radius: 0`, transparent
  background. Horizontal writing lines are drawn with a
  `repeating-linear-gradient` in the hairline tone on a `1.75rem` pitch; typed
  text (Body, 16px) has `line-height: 1.75rem` so it sits on the lines.
- **Focus:** `outline: none`; the baseline rule shifts from ink to vermilion. (See
  finish note — this is a weak focus indicator.)
- **Disabled:** `opacity: 0.55` (streaming and submitting states).
- **Placeholder:** styled `#9b978d` but no `placeholder` attribute ships — dead
  rule, not part of the system.

### Record Submit Control

- **Character:** a text link that happens to submit; no button chrome.
- **Style:** `background: none`, `border: 0`, `padding: 0.35rem 0`, Action type
  (13px, 600, tracked 0.04em), Editorial Vermilion. Label is `Record answer` plus
  an `aria-hidden` `→` glyph.
- **Right-aligned** in a baseline-aligned actions row; a Soft Ink hint
  (`One question this round.` / `Recording…`) sits at the row's left.
- **Disabled:** text colour `#a7a299`, `cursor: default` — while blank, streaming,
  or submitting.

### Recorded Confirmation

- **Character:** a quiet, final, one-line receipt.
- **Style:** Label type in Editorial Vermilion, `border-top: 1px solid
var(--accent)`, `1rem` top padding, `1.25rem` top margin. Copy:
  `Recorded — saved to this session`.
- **Motion:** `confirm-in 0.45s ease-out` opacity fade from 0; removed under
  `prefers-reduced-motion`. This is the single authored accent beat.

### Inline Error

- **Character:** the stream broke; say so in place, no dialog.
- **Style:** a region opened by `border-top: 1px solid var(--rule)` and `2.5rem`
  top margin; inside, an error body indented `0.9rem` behind a
  `border-left: 2px solid var(--accent)`.
- **Label:** `The question stopped` — Label type, Editorial Vermilion,
  `aria-hidden`.
- **Message:** Caption type (15px / 1.55), Near-Black Ink, `role="alert"`. Names
  the failure and the recovery (e.g. "Check that Ollama is running, then reload.").
- Replaces the answer block entirely; never overlays.

### The Six View States (state table)

| State      | Question region                                                                  | Answer form                                                                              | Indicator                                                  | Accent moment                                         | Live region                    |
| ---------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- | ------------------------------ |
| connecting | placeholder "Preparing the first question", Soft Ink @0.65, blinking cursor rule | hidden                                                                                   | note "Reaching the model…" (`role=status`)                 | none                                                  | question `<p>` hidden          |
| streaming  | question fills token-by-token, serif, blinking cursor rule trailing              | visible; textarea + submit disabled                                                      | note "the question is still being written" (`role=status`) | none                                                  | `aria-live=polite` on question |
| complete   | full question, no cursor                                                         | active; textarea enabled, hint "One question this round.", submit enabled when non-blank | none                                                       | none                                                  | polite                         |
| submitting | question static                                                                  | textarea + submit disabled, hint "Recording…" (`role=status`)                            | none                                                       | none                                                  | polite                         |
| recorded   | question static                                                                  | form removed                                                                             | none                                                       | confirmation line + vermilion top rule, 0.45s fade-in | confirm line `role=status`     |
| failed     | question frozen Soft Ink @0.55, static (non-blinking) cursor rule                | form removed                                                                             | none                                                       | error label + 2px vermilion left rule                 | message `role=alert`           |

## Do's and Don'ts

### Do:

- **Do** keep every surface on the warm paper ground (`#f4f1ea`) with no fill, no
  card, no shadow — structure with 1px hairline rules (`#d8d2c4`) and space.
- **Do** set questions and only questions (plus the wordmark) in Source Serif 4;
  everything operable or informational is Libre Franklin.
- **Do** spend vermilion (`#c8402b`) on exactly one element per state: the submit
  control, the focused field rule, the confirmation, or the error mark.
- **Do** track 11px labels uppercase at 0.16em; keep the column at the 40rem
  measure, centred.
- **Do** gate every animation behind `prefers-reduced-motion`, and give any
  motion-only status a visible text equivalent.
- **Do** write error copy that names the failure and the recovery step.

### Don't:

- **Don't** introduce a second accent hue, a gradient, or tinted text — secondary
  text is Soft Ink (`#55524b`) only.
- **Don't** add `border-radius` above the 2px ceiling, and prefer 0.
- **Don't** wrap content in a bordered or filled box, or add a `box-shadow`.
- **Don't** use bouncing dots or a spinner for streaming — the streaming signal is
  the single blinking 2px rule.
- **Don't** widen the measure past 40rem or left-align the column.
