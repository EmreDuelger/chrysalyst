import type { UiStrings } from './strings.ts';

/** The interface's German copy. */
export const de: UiStrings = {
  interviewRegion: 'Interview',
  topbarMeta: 'Interview · 01',
  questionKicker: 'Die Frage',
  questionPlaceholder: 'Die erste Frage wird vorbereitet',
  reachingModel: 'Verbindung zum Modell …',
  streamingAlternative: 'die Frage wird noch geschrieben',
  answerLabel: 'Ihre Antwort',
  roundHint: 'Eine Frage in dieser Runde.',
  recording: 'Wird gespeichert …',
  submit: 'Antwort speichern',
  recordedAt: (time) => `Gespeichert · ${time} · in dieser Sitzung`,
  failureLabel: 'Die Frage ist abgebrochen',
  languageControl: 'Sprache',
};
