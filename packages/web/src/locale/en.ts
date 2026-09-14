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
  setupRegion: 'Setup',
  setupHeading: 'chrysalyst needs a language model',
  setupChecking: 'Checking the language model…',
  setupUnreachable: (backend) => `chrysalyst cannot reach ${backend}.`,
  setupUnreachableStep: (backend) => `Start ${backend}, then check again.`,
  setupModelMissing: (backend, model) =>
    `${backend} is running, but it does not hold the model ${model}.`,
  setupModelMissingStep: (backend, model) =>
    `Install ${model} in ${backend}, then check again.`,
  setupRecheck: 'Check again',
  setupFailureLabel: 'The status check failed',
};
