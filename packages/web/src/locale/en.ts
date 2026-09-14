import type { UiStrings } from './strings.ts';

/** The interface's English copy. */
export const en: UiStrings = {
  interviewRegion: 'Interview',
  topbarMeta: 'Interview · 01',
  questionKicker: 'The question',
  questionPlaceholder: 'Preparing the first question',
  reachingModel: 'Reaching the model…',
  streamingAlternative: 'the question is still being written',
  answerLabel: 'Your answer',
  roundHint: 'One question this round.',
  recording: 'Recording…',
  submit: 'Record answer',
  recordedAt: (time) => `Recorded · ${time} · saved to this session`,
  failureLabel: 'The question stopped',
  languageControl: 'Language',
  languageSwitchLabel: 'The language changed',
  languageSwitchPrompt:
    'Starting the interview in this language discards the answer you have typed.',
  languageSwitchDiscard: 'Discard and restart',
  languageSwitchKeep: 'Keep my answer',
};
