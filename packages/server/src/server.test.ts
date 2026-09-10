import type { AddressInfo } from 'node:net';

import type { CoreDependencies, InterviewState } from '@chrysalyst/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from './app.ts';
import { type ServerHandle, startServer } from './server.ts';

let running: ServerHandle | undefined;

afterEach(async () => {
  if (running) {
    await running.close();
    running = undefined;
  }
});

/**
 * Dependencies this suite's server never reaches: it drives `/health` alone,
 * and every port throws so a route that quietly started using one fails here.
 */
function untouchedDependencies(): CoreDependencies<InterviewState> {
  const refuse = (): never => {
    throw new Error('the server suite reaches no dependency');
  };
  return {
    llm: { status: refuse, complete: refuse, stream: refuse },
    sessions: { list: refuse, load: refuse, save: refuse },
    clock: { now: refuse },
  };
}

function testApp() {
  return createApp(untouchedDependencies());
}

function boundAddress(handle: ServerHandle): AddressInfo {
  const address = handle.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error(`expected a bound TCP address, got ${String(address)}`);
  }
  return address;
}

describe('startServer', () => {
  it('serves the app it is given on an ephemeral port and releases it on close', async () => {
    running = await startServer(testApp(), 0);
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
    running = await startServer(testApp(), 0);
    const { port } = boundAddress(running);

    await expect(startServer(testApp(), port)).rejects.toThrow(
      /Cannot start the chrysalyst server on 127\.0\.0\.1:/,
    );
  });

  it('binds 127.0.0.1 by default', async () => {
    running = await startServer(testApp(), 0);

    const { address } = boundAddress(running);

    expect(address).toBe('127.0.0.1');
    expect(address).not.toBe('0.0.0.0');
    expect(address).not.toBe('::');
  });
});
