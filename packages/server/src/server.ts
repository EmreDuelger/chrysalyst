import { serve, type ServerType } from '@hono/node-server';

import { app } from './app.ts';

const DEFAULT_HOST = '127.0.0.1';

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
 * Binds the Hono app to a Node TCP socket. The host defaults to the loopback
 * interface so no deployment accidentally exposes chrysalyst to its network;
 * a caller that needs a wider bind must ask for it explicitly. Resolves once
 * the socket is listening, so callers can read the bound address immediately;
 * rejects if the socket never binds — a taken port above all — with the
 * attempted host and port named and the underlying Node error as `cause`.
 */
export function startServer(
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
