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

  it('exposes the interview routes with a typed path parameter and rejects an undefined route', () => {
    const client = hc<AppType>('http://localhost');

    expectTypeOf(client.interview.$post).toBeFunction();
    expectTypeOf(client.interview[':id'].question.$get).toBeFunction();
    expectTypeOf(client.interview[':id'].answer.$post).toBeFunction();

    expectTypeOf(client.interview[':id'].question.$get).toBeCallableWith({
      param: { id: 'a-session-id' },
    });
    expectTypeOf(client.interview[':id'].answer.$post).toBeCallableWith({
      param: { id: 'a-session-id' },
      json: { answer: 'an answer' },
    });

    // @ts-expect-error the app defines no `/interview/:id/nope` route
    assertType<unknown>(client.interview[':id'].nope);
  });
});
