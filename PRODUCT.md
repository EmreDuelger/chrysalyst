# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a non-technical idea-holder — a product owner, founder, or business-unit
lead without a development background. They have a product idea in their head and no
means to turn it into a document a developer or agency can build from. They sit down
alone, at a desk, with the local web app open in a browser, and work through a guided
interview one question at a time.

Secondary audience: the recipient of the finished spec (a developer or agency). They
never touch the interview; they read the exported document and its list of open
questions to see what must be resolved before implementation starts.

## Product Purpose

chrysalyst turns a vague product idea into a clear, contradiction-free, handoff-ready
specification through an adaptive, LLM-guided interview. Instead of handing the user a
blank PRD template, it asks targeted follow-up questions, detects contradictions and
gaps in the answers, and distills what was said — step by step — into a structured
spec plus an explicit register of assumptions and open questions.

Success: a non-technical person, starting from an empty state, reaches an exported
specification a developer can act on, without using a command line and without sending
their idea to a third-party service.

## Positioning

The interview is adaptive and runs entirely on a local model. Static PRD templates
do not adapt to the idea; free chat with a cloud AI enforces no structure, checks no
consistency, and ships the idea to someone else's server; developer spec tools assume
technical knowledge and a terminal. chrysalyst is the only one of these that adapts
its questions to the answers, checks the answers against each other, and keeps the
whole idea on the user's own machine.

## Operating Context

- Runs locally on `localhost` in a modern browser; the server binds the loopback
  interface only. No accounts, no server-side storage.
- Requires a local LLM backend (Ollama, llama.cpp, or LM Studio). When none is
  reachable the app detects this at startup and guides the user through backend
  setup; the interview stays blocked until a backend is available. Existing sessions
  remain readable and exportable in that state.
- Network access is used only for the optional LLM web search and for model/backend
  downloads. The core interview works offline.
- Each session is a folder on disk (Markdown transcript + JSON state), transparent
  and version-controllable by the user.
- The interview must feel fluid: model answers stream; the first perceptible reaction
  should appear within a few seconds even on a small model.

## Capabilities and Constraints

Five core capabilities, built in roadmap order:

1. Adaptive guided interview — a dynamic question tree; the system picks the next
   branch from the answers so far, the model phrases and deepens the concrete
   question. Not a fixed questionnaire.
2. Contradiction and gap detection — the system recognises when two answers cannot
   both hold, or when an essential aspect is missing, and asks about it rather than
   writing the contradiction into the spec.
3. Step-by-step distillation — answers are continuously condensed into a growing
   structured document the user watches take shape during the interview.
4. Assumptions and open-questions register — every unverified commitment is marked
   an assumption, every known unresolved point tracked as an open question; both are
   part of the export.
5. Template selection for export — the user picks the target format (classic PRD,
   user-story collection, Lastenheft); the same interview data renders into it.

Constraints and terminology:

- TypeScript throughout; hexagonal architecture (`packages/core` is framework-,
  network-, and filesystem-free and defines the ports; `packages/server` holds the
  adapters and the Hono HTTP API; `packages/web` is the React browser client and
  talks only to the server's HTTP API).
- UI and spec output are bilingual (German and English) — interface strings **and**
  prompt templates. The model interviews in the user's language. (Roadmap M5; the
  walking skeleton M3 is English-only.)
- No cloud LLM SDK anywhere in product code.
- No telemetry without explicit consent.
- Out of scope: code or implementation generation; market/competitor/pricing
  analysis as an output artifact; real-time collaboration; project/task management.
- Planned but not in v1: a hosted deployment at feature parity with the local
  install, with an auto-detected or user-supplied backend — never a forced cloud LLM.

Glossary: chrysalyst (chrysalis + catalyst/analyst — the vague idea pupates into a
structured spec) · Spec (the structured target document — problem, users,
requirements, not implementation) · Interview · Question tree · Distillation ·
Contradiction · Assumption · Open question · Template · Session.

## Brand Commitments

- The name is **chrysalyst**, always lowercase.
- The guiding metaphor is transformation from vague to structured — a chrysalis, a
  crystallisation. It is a loose leitmotif, not a mandated visual.
- No logo, palette, or typeface is locked. The visual world is decided in the first
  UI feature's design pass (roadmap M3) and recorded in DESIGN.md.

## Evidence on Hand

- `specs/mission.md` — authoritative problem, users, capabilities, constraints.
- `specs/roadmap.md` — milestone order M0…M18 plus post-v1 P1.
- No customers, testimonials, benchmarks, pricing, or press exist. Future work must
  not fabricate any.

## Product Principles

- **Local and private by default.** The idea never leaves the user's machine unless
  they turn on optional search. Design and copy must never imply a remote service.
- **Structure is the product, not the user's burden.** The user brings raw thoughts;
  chrysalyst supplies the shape. Never ask the user to know what goes in which field.
- **Guide, never grade.** The interview draws answers out; it does not judge the
  user or their idea. Tone is warm and conversational, plain-spoken, no jargon.
- **Calm and single-purpose.** One thing happens at a time — one question, one
  answer. The interface stays quiet so the thinking is loud.
- **Transparent artifacts.** Sessions are plain files on disk the user can read,
  diff, and keep. The product hides nothing about what it stored.

## Accessibility & Inclusion

WCAG 2.2 AA is the binding target for every surface. Keyboard-first operation;
contrast at least 4.5:1 for text; a visible focus indicator on every interactive
element; `prefers-reduced-motion` honoured; streaming model output delivered in a
polite live region so a screen reader announces it as it arrives; every control
carries an accessible name.
