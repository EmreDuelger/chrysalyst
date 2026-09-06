import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { type ServerHandle, startServer } from './server.ts';

let running: ServerHandle | undefined;

afterEach(async () => {
  if (running) {
    await running.close();
    running = undefined;
  }
});

function boundAddress(handle: ServerHandle): AddressInfo {
  const address = handle.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`expected a bound TCP address, got ${String(address)}`);
  }
  return address;
}

describe('startServer', () => {
  it('serves /health on a bound ephemeral port and releases it on close', async () => {
    running = await startServer(0);
    const { port } = boundAddress(running);

    const served = await fetch(`http://127.0.0.1:${String(port)}/health`);
    expect(served.status).toBe(200);

    await running.close();
    running = undefined;

    await expect(
      fetch(`http://127.0.0.1:${String(port)}/health`),
    ).rejects.toThrow();
  });

  it('rejects when the port is already bound', async () => {
    running = await startServer(0);
    const { port } = boundAddress(running);

    await expect(startServer(port)).rejects.toThrow(
      /Cannot start the chrysalyst server on 127\.0\.0\.1:/,
    );
  });

  it('binds 127.0.0.1 rather than every interface', async () => {
    running = await startServer(0);

    const { address } = boundAddress(running);

    expect(address).toBe('127.0.0.1');
    expect(address).not.toBe('0.0.0.0');
    expect(address).not.toBe('::');
  });
});
