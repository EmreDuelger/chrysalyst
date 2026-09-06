import { hc } from 'hono/client';
import { assertType, describe, expectTypeOf, it } from 'vitest';

import type { AppType } from './app.ts';

describe('hc<AppType> client', () => {
  it('exposes the health route and rejects an undefined route', () => {
    const client = hc<AppType>('http://localhost');

    expectTypeOf(client.health.$get).toBeFunction();

    // @ts-expect-error the app declares no `/unknown` route, so the client omits it
    assertType<unknown>(client.unknown);
  });
});
