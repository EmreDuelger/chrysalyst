import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SetupGuide, type SetupGuideProps } from './SetupGuide.tsx';
import { SUPPORTED_LOCALES } from '../locale/locale.ts';
import { uiStrings } from '../locale/strings.ts';

afterEach(() => {
  cleanup();
});

const BACKEND = 'Ollama';
const MODEL = 'llama3.2:3b';

function renderGuide(
  blocked: SetupGuideProps['blocked'],
  onCheckAgain: () => void = vi.fn(),
  locale: SetupGuideProps['locale'] = 'en',
) {
  render(
    <SetupGuide
      locale={locale}
      blocked={blocked}
      onCheckAgain={onCheckAgain}
    />,
  );
}

describe('SetupGuide', () => {
  it('names the backend for an unreachable fault and the backend and model for a missing model, with different actions', () => {
    const { unmount } = render(
      <SetupGuide
        locale="en"
        blocked={{
          kind: 'fault',
          reason: 'unreachable',
          backend: BACKEND,
          model: MODEL,
        }}
        onCheckAgain={vi.fn()}
      />,
    );
    const unreachableText = screen.getByLabelText(
      uiStrings.en.setupRegion,
    ).textContent;
    expect(unreachableText).toContain(BACKEND);
    expect(unreachableText).toContain(uiStrings.en.setupUnreachable(BACKEND));
    expect(unreachableText).toContain(
      uiStrings.en.setupUnreachableStep(BACKEND),
    );
    unmount();

    render(
      <SetupGuide
        locale="en"
        blocked={{
          kind: 'fault',
          reason: 'model-missing',
          backend: BACKEND,
          model: MODEL,
        }}
        onCheckAgain={vi.fn()}
      />,
    );
    const missingText = screen.getByLabelText(
      uiStrings.en.setupRegion,
    ).textContent;
    expect(missingText).toContain(BACKEND);
    expect(missingText).toContain(MODEL);
    expect(missingText).toContain(
      uiStrings.en.setupModelMissing(BACKEND, MODEL),
    );
    expect(missingText).toContain(
      uiStrings.en.setupModelMissingStep(BACKEND, MODEL),
    );

    expect(missingText).not.toBe(unreachableText);
  });

  it.each(SUPPORTED_LOCALES.map((locale) => ({ locale })))(
    'renders every label from the dictionary for $locale and leaves the configured names unchanged',
    ({ locale }) => {
      const copy = uiStrings[locale];
      renderGuide(
        {
          kind: 'fault',
          reason: 'model-missing',
          backend: BACKEND,
          model: MODEL,
        },
        vi.fn(),
        locale,
      );

      const region = screen.getByLabelText(copy.setupRegion);
      const text = region.textContent;

      expect(screen.getByText(copy.setupHeading)).toBeDefined();
      expect(text).toContain(copy.setupModelMissing(BACKEND, MODEL));
      expect(text).toContain(copy.setupModelMissingStep(BACKEND, MODEL));
      expect(
        screen.getByRole('button', { name: copy.setupRecheck }),
      ).toBeDefined();
      expect(text).toContain(BACKEND);
      expect(text).toContain(MODEL);
    },
  );

  it('leaves the backend and model names unchanged between languages while the labels differ', () => {
    renderGuide(
      { kind: 'fault', reason: 'unreachable', backend: BACKEND, model: MODEL },
      vi.fn(),
      'en',
    );
    const enText = screen.getByLabelText(uiStrings.en.setupRegion).textContent;
    cleanup();

    renderGuide(
      { kind: 'fault', reason: 'unreachable', backend: BACKEND, model: MODEL },
      vi.fn(),
      'de',
    );
    const deText = screen.getByLabelText(uiStrings.de.setupRegion).textContent;

    expect(deText).not.toBe(enText);
    expect(enText).toContain(BACKEND);
    expect(deText).toContain(BACKEND);
  });

  it("shows a failed probe's message character for character under the failure label", () => {
    const message = 'Checking the backend failed: GET /status answered 503';
    renderGuide({ kind: 'failure', message });

    expect(screen.getByText(uiStrings.en.setupFailureLabel)).toBeDefined();
    expect(screen.getByText(message)).toBeDefined();
  });

  it('invokes onCheckAgain when the check control is activated', () => {
    const onCheckAgain = vi.fn();
    renderGuide(
      { kind: 'fault', reason: 'unreachable', backend: BACKEND, model: MODEL },
      onCheckAgain,
    );

    fireEvent.click(
      screen.getByRole('button', { name: uiStrings.en.setupRecheck }),
    );

    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });

  it('gives the check control an accessible, focusable, keyboard-operable button', () => {
    renderGuide({
      kind: 'fault',
      reason: 'unreachable',
      backend: BACKEND,
      model: MODEL,
    });

    const control = screen.getByRole('button', {
      name: uiStrings.en.setupRecheck,
    });

    expect(control.tagName).toBe('BUTTON');
    control.focus();
    expect(document.activeElement).toBe(control);
  });
});
