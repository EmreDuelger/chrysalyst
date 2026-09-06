import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './App.tsx';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('App', () => {
  it('renders the chrysalyst heading inside #root', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    render(<App />, { container: root });

    const heading = within(root).getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('chrysalyst');
  });
});
