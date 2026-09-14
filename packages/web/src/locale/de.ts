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
  setupRegion: 'Einrichtung',
  setupHeading: 'chrysalyst braucht ein Sprachmodell',
  setupChecking: 'Das Sprachmodell wird geprüft …',
  setupUnreachable: (backend) => `chrysalyst erreicht ${backend} nicht.`,
  setupUnreachableStep: (backend) =>
    `Starten Sie ${backend} und prüfen Sie dann erneut.`,
  setupModelMissing: (backend, model) =>
    `${backend} läuft, hält aber das Modell ${model} nicht bereit.`,
  setupModelMissingStep: (backend, model) =>
    `Installieren Sie ${model} in ${backend} und prüfen Sie dann erneut.`,
  setupRecheck: 'Erneut prüfen',
  setupFailureLabel: 'Die Statusprüfung ist fehlgeschlagen',
};
