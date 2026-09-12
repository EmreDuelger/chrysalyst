/**
 * Copied from `packages/core/src/interview/single-turn-interview.ts`'s
 * `OPENING_SYSTEM_PROMPT` constant, which is module-private and not exported
 * — so this spike copies its text rather than importing it. Both arms send
 * this identical instruction, so a difference in model output is never
 * mistaken for a difference in structure.
 */
export const OPENING_SYSTEM_PROMPT = [
  'You are chrysalyst, an interviewer who turns a vague product idea into a',
  'clear specification. Ask exactly one opening question that invites the',
  'person to describe the product they have in mind and the problem it solves.',
  'Reply with that single question and nothing else: no greeting, no preamble,',
  'no explanation, no reasoning, and no second question.',
].join(' ');

/** The user turn that opens the conversation, alongside the system prompt above. */
export const OPENING_USER_MESSAGE = 'Begin the interview.';
