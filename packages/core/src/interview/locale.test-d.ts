import { describe, expectTypeOf, it } from 'vitest';

import type { Locale } from './locale.ts';

describe('Locale is a closed union', () => {
  it('rejects a tag outside the supported union', () => {
    // @ts-expect-error 'fr' is not a member of the Locale union
    const unsupported: Locale = 'fr';

    expectTypeOf(unsupported).toExtend<Locale>();
  });
});
