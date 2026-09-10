import { isAnswered } from './state.ts';
import type { InterviewState, Turn } from './state.ts';
import type { StoredSession } from '../ports/index.ts';

/**
 * Renders a stored interview session as the Markdown its `transcript.md` holds.
 *
 * The shape of that Markdown is a fact about the interview domain, not the
 * store: `adapters/filesystem-session-store` writes the file but never
 * interprets `TState` (decision-log [1a]), so the state's owner decides how it
 * reads. Takes the port's own `StoredSession` so the store passes `save`'s
 * argument straight through with no adapting lambda. Pure by construction — it
 * reads no clock, touches no file, reaches no model, and the same stored
 * session always renders the same text.
 */
export function renderTranscript(
  session: StoredSession<InterviewState>,
): string {
  const header = [
    '# Interview transcript',
    '',
    `- Session \`${session.id}\``,
    `- Created ${session.createdAt.toISOString()}`,
    `- Updated ${session.updatedAt.toISOString()}`,
  ].join('\n');

  const turns = session.state.turns.map((turn, index) =>
    renderTurn(turn, index + 1),
  );

  return [header, ...turns].join('\n\n') + '\n';
}

function renderTurn(turn: Turn, position: number): string {
  const lines = [
    `## Turn ${String(position)}`,
    '',
    `**Asked** ${turn.askedAt}`,
    '',
    `> ${turn.question}`,
    '',
  ];

  if (isAnswered(turn)) {
    lines.push(`**Answered** ${turn.answeredAt}`, '', `> ${turn.answer}`);
  } else {
    lines.push('**Answered** _still awaited_');
  }

  return lines.join('\n');
}
