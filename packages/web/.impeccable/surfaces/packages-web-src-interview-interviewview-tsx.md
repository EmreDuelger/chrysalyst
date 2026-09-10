---
version: 1
slug: "packages-web-src-interview-interviewview-tsx"
primary_target: "packages/web/src/interview/InterviewView.tsx"
related_targets: ["packages/web/src/interview/interview-api.ts","packages/web/src/App.tsx"]
---

## Scope & mode

Surface: the single interview-question view (`packages/web/src/interview/InterviewView.tsx`) — roadmap M3, chrysalyst's first UI. Mode: **Operate** — the visitor answers one question and moves on; scanability, calm, and familiar affordances outrank expression.

This surface establishes the visual world every later screen inherits (live spec preview M11, template export M15, session library M17) and the wordmark.

## Audience, job, action

A non-technical founder or product owner, alone at a desk, thinking through a still-fuzzy idea. Job: answer one adaptive interview question in their own words and see it recorded. Action: read the streamed question, type an answer, submit, watch it save. No proof/content to sell — Operate, not Persuade.

## Constraints

- WCAG 2.2 AA (PRODUCT.md): question streams into a polite live region; every control has an accessible name; visible focus; `prefers-reduced-motion` honoured; contrast ≥ 4.5:1.
- English only (M5 adds DE/EN — labels and copy must externalise cleanly).
- React 19 + Vite; `packages/web` imports no workspace package; fonts bundled locally, no CDN.
- Must feel fast on a small local model — motion may never delay a token's arrival.

## Direction contract

THESIS: An editorial interview page — one question set like a magazine standfirst, answered in a clean ruled column, hairline rules and tracked metadata labels doing all the structural work. Refuses the chat thread and the "Step 1 of 12" form wizard alike.

OWN-WORLD: Editorial minimalism (Monocle / Apartamento / Études register), pinned by the user. Warm off-white ground `#F4F1EA`, near-black ink `#1A1A1A`, one editorial vermilion accent `#C8402B` used sparingly (links, active, later contradiction marks), hairline rule `#D8D2C4`. The question is set in a transitional text serif (Source Serif 4); every label, the answer field, and controls are a Franklin-lineage grotesque (Libre Franklin). Micro-labels are uppercase, tracked `+0.14em`, small. Generous outer margins, a single ~640px measure, a strict baseline grid. No cards, no shadows, no radius beyond 2px; structure is rules and space.

STORY: The visitor understands the machine is asking a considered question and recording their answer permanently and privately; believes this is calm and unhurried, not a test; reads the question, writes an answer in the ruled column, submits, and sees a quiet "recorded" confirmation with a timestamp.

FIRST VIEWPORT: Off-white full-bleed ground. A thin top rule; above it left, the wordmark `◈ chrysalyst`; right, a tracked metadata line (`INTERVIEW · 01`). Centred ~640px column. A small tracked kicker (`THE QUESTION`), then the question in serif at ~28px/1.3, tokens appearing token-by-token into a live region with a low-key blinking rule as the streaming indicator (text alternative "the question is still being written"). Below, separated by a hairline: the grotesque label `YOUR ANSWER`, a ruled multi-line answer field (underline rules only, no box), and a right-aligned text submit control `Record answer →` in the accent, disabled while blank or while streaming. On submit: field and control disable, the rule turns vermilion for a beat, a tracked confirmation line appears (`RECORDED · 14:22`). Error: streaming rule stops, the message replaces the answer block in ink with a vermilion left rule — inline, no dialog.

FORM: Editorial minimalism, user-pinned from https://open-design.ai/plugins/example-open-design-landing/ ("Atelier Zero"). This overrides the concept-seed assignment (index 7, "The Developing Print", seed key b15466de) per impeccable's brief-pinned-beats-the-roll rule. Translated from that reference's Persuade/landing register into Operate: the editorial type, hairlines, tracked labels, grid and restraint are kept; the hero-collage spectacle is dropped.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Memorable moment

The question arriving word by word in a serif standfirst, with only a single hairline rule blinking to say the model is still writing — the opposite of a chatbot's bouncing dots.

## Unresolved

- Exact serif/grotesque confirmation at build time via `impeccable font-match` (Source Serif 4 / Libre Franklin are the intended targets, both self-hosted).
- Dark mode: out of scope for M3; the token layer is built to allow it later.
- The mark (`◈` placeholder above) is finalised as an SVG in this subphase; see the wordmark asset.
