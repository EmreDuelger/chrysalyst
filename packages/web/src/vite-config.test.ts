// @vitest-environment node
import { describe, expect, it } from 'vitest';

import viteConfig from '../vite.config.ts';

interface ProxyConfig {
  readonly server?: {
    readonly proxy?: Readonly<Record<string, unknown>>;
  };
}

describe('web dev server proxy', () => {
  it("routes the interview prefix to the API's loopback address", () => {
    const proxy = (viteConfig as ProxyConfig).server?.proxy;

    expect(proxy).toBeDefined();
    expect(Object.keys(proxy ?? {})).toContain('/interview');
    expect(proxy?.['/interview']).toBe('http://127.0.0.1:3000');
  });

  it('adds no proxy for a route it does not own', () => {
    const proxy = (viteConfig as ProxyConfig).server?.proxy ?? {};

    expect(proxy['/health']).toBeUndefined();
  });
});
