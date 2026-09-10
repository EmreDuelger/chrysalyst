import { serve, type ServerType } from '@hono/node-server';

const DEFAULT_HOST = '127.0.0.1';

/**
 * The app this module can bind: anything exposing the `fetch` member
 * `@hono/node-server` calls per request. Typed by that member alone so the
 * server names no route type and stays ignorant of which app it serves.
 */
type ServableApp = Pick<Parameters<typeof serve>[0], 'fetch'>;

/**
 * The handle a started server hands back to its caller. `close` is the only
 * supported way to release the bound port; it resolves once the socket is
 * fully closed, so a caller may then rebind the same port. `server` is exposed
 * for reading the bound address — not for further mutation of the listener.
 */
export interface ServerHandle {
  readonly server: ServerType;
  readonly close: () => Promise<void>;
}

/**
 * Binds the given app to a Node TCP socket. The app is passed in rather than
 * imported, so the composition root decides which app is served and a test can
 * bind one built over fakes. The host defaults to the loopback interface so no
 * deployment accidentally exposes chrysalyst to its network; a caller that
 * needs a wider bind must ask for it explicitly. Resolves once the socket is
 * listening, so callers can read the bound address immediately; rejects if the
 * socket never binds — a taken port above all — with the attempted host and
 * port named and the underlying Node error as `cause`.
 */
export function startServer(
  app: ServableApp,
  port: number,
  host: string = DEFAULT_HOST,
): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const failed = (cause: Error): void => {
      reject(
        new Error(
          `Cannot start the chrysalyst server on ${host}:${String(port)}`,
          { cause },
        ),
      );
    };
    const server = serve({ fetch: app.fetch, port, hostname: host }, () => {
      server.removeListener('error', failed);
      resolve({ server, close: () => closeServer(server) });
    });
    server.once('error', failed);
  });
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
