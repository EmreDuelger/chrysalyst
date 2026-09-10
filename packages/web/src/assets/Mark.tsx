import type { JSX } from 'react';

/**
 * The chrysalyst mark: a crystalline rhombus with its lower half filled — the
 * vague idea crystallising upward into structure. It sits beside the wordmark
 * text, which already names the product, so the mark is decorative and carries
 * no accessible name of its own. Strokes and fill take `currentColor` so the
 * token layer, not this file, decides the mark's colour.
 */
export interface MarkProps {
  readonly className?: string;
}

export function Mark({ className }: MarkProps = {}): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 1.5 22.5 12 12 22.5 1.5 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M1.5 12 12 22.5 22.5 12Z" fill="currentColor" />
    </svg>
  );
}
