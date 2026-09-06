// @vitest-environment node
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const defaultOutDir = join(packageRoot, 'dist');

describe('production build', () => {
  it('emits index.html referencing a module asset into a temporary outDir', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'chrysalyst-web-build-'));
    const defaultOutDirExistedBefore = existsSync(defaultOutDir);

    await build({
      root: packageRoot,
      configFile: join(packageRoot, 'vite.config.ts'),
      logLevel: 'silent',
      build: {
        outDir,
        emptyOutDir: true,
      },
    });

    const emittedHtml = join(outDir, 'index.html');
    expect(existsSync(emittedHtml)).toBe(true);

    const html = await readFile(emittedHtml, 'utf8');
    expect(html).toMatch(/<script[^>]+type="module"[^>]+src="[^"]+"/);

    expect(existsSync(defaultOutDir)).toBe(defaultOutDirExistedBefore);
  });
});
