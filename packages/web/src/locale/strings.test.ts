import { describe, expect, it } from 'vitest';

import { de } from './de.ts';
import { en } from './en.ts';
import type { UiStrings } from './strings.ts';

type StringMember = Exclude<keyof UiStrings, 'recordedAt'>;

const STRING_MEMBERS = (Object.keys(en) as (keyof UiStrings)[]).filter(
  (member): member is StringMember => typeof en[member] === 'string',
);

const SHARED_MEMBERS: readonly StringMember[] = [
  'interviewRegion',
  'topbarMeta',
];

describe('uiStrings', () => {
  it('has every member present and non-blank for both languages', () => {
    for (const member of STRING_MEMBERS) {
      expect(en[member].trim()).not.toBe('');
      expect(de[member].trim()).not.toBe('');
    }
    expect(en.recordedAt('09:41').trim()).not.toBe('');
    expect(de.recordedAt('09:41').trim()).not.toBe('');
  });

  it('differs between languages for every member except the shared chrome labels', () => {
    for (const member of STRING_MEMBERS) {
      if (SHARED_MEMBERS.includes(member)) {
        expect(de[member]).toBe(en[member]);
      } else {
        expect(de[member]).not.toBe(en[member]);
      }
    }
    expect(de.recordedAt('09:41')).not.toBe(en.recordedAt('09:41'));
  });

  it('interpolates the given time into recordedAt for both languages', () => {
    expect(en.recordedAt('09:41')).toBe(
      'Recorded · 09:41 · saved to this session',
    );
    expect(de.recordedAt('09:41')).toBe(
      'Gespeichert · 09:41 · in dieser Sitzung',
    );
  });
});
