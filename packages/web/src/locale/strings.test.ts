import { describe, expect, it } from 'vitest';

import { de } from './de.ts';
import { en } from './en.ts';
import type { UiStrings } from './strings.ts';

type FunctionMember =
  | 'recordedAt'
  | 'setupUnreachable'
  | 'setupUnreachableStep'
  | 'setupModelMissing'
  | 'setupModelMissingStep';

type StringMember = Exclude<keyof UiStrings, FunctionMember>;

const STRING_MEMBERS = (Object.keys(en) as (keyof UiStrings)[]).filter(
  (member): member is StringMember => typeof en[member] === 'string',
);

const SHARED_MEMBERS: readonly StringMember[] = [
  'interviewRegion',
  'topbarMeta',
];

describe('uiStrings', () => {
  it('has every string member present and non-blank for both languages', () => {
    for (const member of STRING_MEMBERS) {
      expect(en[member].trim()).not.toBe('');
      expect(de[member].trim()).not.toBe('');
    }
  });

  it('has every interpolated member present and non-blank for both languages', () => {
    expect(en.recordedAt('09:41').trim()).not.toBe('');
    expect(de.recordedAt('09:41').trim()).not.toBe('');
    expect(en.setupUnreachable('Ollama').trim()).not.toBe('');
    expect(de.setupUnreachable('Ollama').trim()).not.toBe('');
    expect(en.setupUnreachableStep('Ollama').trim()).not.toBe('');
    expect(de.setupUnreachableStep('Ollama').trim()).not.toBe('');
    expect(en.setupModelMissing('Ollama', 'llama3.2:3b').trim()).not.toBe('');
    expect(de.setupModelMissing('Ollama', 'llama3.2:3b').trim()).not.toBe('');
    expect(en.setupModelMissingStep('Ollama', 'llama3.2:3b').trim()).not.toBe(
      '',
    );
    expect(de.setupModelMissingStep('Ollama', 'llama3.2:3b').trim()).not.toBe(
      '',
    );
  });

  it('differs between languages for every string member except the shared chrome labels', () => {
    for (const member of STRING_MEMBERS) {
      if (SHARED_MEMBERS.includes(member)) {
        expect(de[member]).toBe(en[member]);
      } else {
        expect(de[member]).not.toBe(en[member]);
      }
    }
  });

  it('differs between languages for every interpolated member', () => {
    expect(de.recordedAt('09:41')).not.toBe(en.recordedAt('09:41'));
    expect(de.setupUnreachable('Ollama')).not.toBe(
      en.setupUnreachable('Ollama'),
    );
    expect(de.setupUnreachableStep('Ollama')).not.toBe(
      en.setupUnreachableStep('Ollama'),
    );
    expect(de.setupModelMissing('Ollama', 'llama3.2:3b')).not.toBe(
      en.setupModelMissing('Ollama', 'llama3.2:3b'),
    );
    expect(de.setupModelMissingStep('Ollama', 'llama3.2:3b')).not.toBe(
      en.setupModelMissingStep('Ollama', 'llama3.2:3b'),
    );
  });

  it('interpolates the given time into recordedAt for both languages', () => {
    expect(en.recordedAt('09:41')).toBe(
      'Recorded · 09:41 · saved to this session',
    );
    expect(de.recordedAt('09:41')).toBe(
      'Gespeichert · 09:41 · in dieser Sitzung',
    );
  });

  it('interpolates the backend name into the unreachable-fault copy for both languages', () => {
    expect(en.setupUnreachable('Ollama')).toBe(
      'chrysalyst cannot reach Ollama.',
    );
    expect(de.setupUnreachable('Ollama')).toBe(
      'chrysalyst erreicht Ollama nicht.',
    );
    expect(en.setupUnreachableStep('Ollama')).toBe(
      'Start Ollama, then check again.',
    );
    expect(de.setupUnreachableStep('Ollama')).toBe(
      'Starten Sie Ollama und prüfen Sie dann erneut.',
    );
  });

  it('interpolates the backend and model names into the model-missing copy for both languages', () => {
    expect(en.setupModelMissing('Ollama', 'llama3.2:3b')).toBe(
      'Ollama is running, but it does not hold the model llama3.2:3b.',
    );
    expect(de.setupModelMissing('Ollama', 'llama3.2:3b')).toBe(
      'Ollama läuft, hält aber das Modell llama3.2:3b nicht bereit.',
    );
    expect(en.setupModelMissingStep('Ollama', 'llama3.2:3b')).toBe(
      'Install llama3.2:3b in Ollama, then check again.',
    );
    expect(de.setupModelMissingStep('Ollama', 'llama3.2:3b')).toBe(
      'Installieren Sie llama3.2:3b in Ollama und prüfen Sie dann erneut.',
    );
  });
});
