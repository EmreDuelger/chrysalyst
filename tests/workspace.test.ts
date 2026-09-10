import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WORKSPACE_PACKAGE_NAMES = [
  '@chrysalyst/core',
  '@chrysalyst/server',
  '@chrysalyst/web',
] as const;

const SHARED_SCRIPTS = ['build', 'typecheck', 'test', 'dev'] as const;

const INTERNAL_PACKAGE_SCOPE = '@chrysalyst/';

interface PackageManifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly type?: string;
  readonly exports?: unknown;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly engines?: Readonly<Record<string, string>>;
  readonly packageManager?: string;
}

function readText(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function readManifest(relativePath: string): PackageManifest {
  return JSON.parse(readText(relativePath)) as PackageManifest;
}

/**
 * Reads the two flat sections this repo relies on from `pnpm-workspace.yaml`:
 * the `packages:` glob list and the `catalog:` name/version map. The file is
 * tool-generated and never nests beyond one level, so an indent-scoped scan is
 * enough and keeps the suite free of a YAML dependency.
 */
function readWorkspaceYaml(): {
  packageGlobs: readonly string[];
  catalogedTools: ReadonlySet<string>;
} {
  const lines = readText('pnpm-workspace.yaml').split(/\r?\n/);
  const packageGlobs: string[] = [];
  const catalogedTools = new Set<string>();
  let section: 'packages' | 'catalog' | undefined;

  for (const line of lines) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;

    const topLevel = /^(\S+):\s*$/.exec(line);
    if (topLevel) {
      const key = topLevel[1];
      section = key === 'packages' || key === 'catalog' ? key : undefined;
      continue;
    }

    if (section === 'packages') {
      const entry = /^\s+-\s*(['"]?)(.+?)\1\s*$/.exec(line);
      if (entry) packageGlobs.push(entry[2]);
      continue;
    }

    if (section === 'catalog') {
      const entry = /^\s+(['"]?)([^'":]+)\1:\s*\S/.exec(line);
      if (entry) catalogedTools.add(entry[2]);
    }
  }

  return { packageGlobs, catalogedTools };
}

function resolvePackageDirs(globs: readonly string[]): readonly string[] {
  const dirs: string[] = [];
  for (const glob of globs) {
    const starMatch = /^(.*)\/\*$/.exec(glob);
    if (!starMatch) {
      dirs.push(glob);
      continue;
    }
    const parent = starMatch[1];
    for (const entry of readdirSync(join(repoRoot, parent), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) dirs.push(`${parent}/${entry.name}`);
    }
  }
  return dirs;
}

function allDependencyEntries(
  manifest: PackageManifest,
): readonly (readonly [string, string])[] {
  return [
    ...Object.entries(manifest.dependencies ?? {}),
    ...Object.entries(manifest.devDependencies ?? {}),
  ];
}

function exportPaths(exportsField: unknown): readonly string[] {
  if (typeof exportsField === 'string') return [exportsField];
  if (exportsField === null || typeof exportsField !== 'object') return [];
  const paths: string[] = [];
  for (const value of Object.values(exportsField as Record<string, unknown>)) {
    paths.push(...exportPaths(value));
  }
  return paths;
}

const UNWALKED_DIRS = new Set(['node_modules', 'dist', 'coverage']);

/**
 * Every file at or below `rootDir` (relative to the repo root) whose base name
 * satisfies `matches`. Build output and dependency trees are skipped so a scan
 * from the repo root stays cheap.
 */
function filesUnder(
  rootDir: string,
  matches: (fileName: string) => boolean,
): readonly string[] {
  const found: string[] = [];
  const walk = (relDir: string): void => {
    for (const entry of readdirSync(join(repoRoot, relDir), {
      withFileTypes: true,
    })) {
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (UNWALKED_DIRS.has(entry.name) || entry.name.startsWith('.'))
          continue;
        walk(rel);
        continue;
      }
      if (matches(entry.name)) found.push(rel);
    }
  };
  walk(rootDir);
  return found;
}

function nonTestSourceFiles(packageDir: string): readonly string[] {
  return filesUnder(
    `${packageDir}/src`,
    (name) =>
      name.endsWith('.ts') &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.test-d.ts'),
  );
}

const AWAIT_AT_MODULE_SCOPE = /(?:^|\W)(?:for )?await /;

function hasModuleScopeAwait(source: string): boolean {
  return source
    .split(/\r?\n/)
    .some((line) => !/^\s/.test(line) && AWAIT_AT_MODULE_SCOPE.test(line));
}

/**
 * The argument expression of the first `skipIf(...)` call in `source`, read by
 * balancing parentheses so a guard containing its own parens comes back whole.
 */
function skipIfGuardExpression(source: string): string {
  const marker = 'skipIf(';
  const markerAt = source.indexOf(marker);
  expect(markerAt, 'a live test file must gate its suite with skipIf').not.toBe(
    -1,
  );
  const exprStart = markerAt + marker.length;
  let depth = 1;
  for (let i = exprStart; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return source.slice(exprStart, i);
    }
  }
  throw new Error('unbalanced skipIf(...) call in a live test file');
}

function guardSkips(expression: string, value: string | undefined): boolean {
  const env = value === undefined ? {} : { CHRYSALYST_LIVE_LLM: value };
  return Boolean(runInNewContext(expression, { process: { env } }));
}

const liveTestFiles = filesUnder('', (name) => name.endsWith('.live.test.ts'));

function importedSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  const pattern = /\b(?:from|import)\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

const { packageGlobs, catalogedTools } = readWorkspaceYaml();
const packageDirs = resolvePackageDirs(packageGlobs);
const manifests = new Map<string, PackageManifest>(
  packageDirs.map((dir) => [dir, readManifest(`${dir}/package.json`)]),
);

describe('monorepo workspace', () => {
  it('enumerates exactly the three workspace packages', () => {
    expect(packageDirs.every((dir) => dir.startsWith('packages/'))).toBe(true);

    const names = [...manifests.values()]
      .map((manifest) => manifest.name)
      .sort((a, b) => String(a).localeCompare(String(b)));

    expect(names).toEqual([...WORKSPACE_PACKAGE_NAMES]);
  });

  it('every package is ESM and declares the shared scripts', () => {
    for (const [dir, manifest] of manifests) {
      expect(manifest.type, `${dir} type`).toBe('module');
      expect(manifest.private, `${dir} private`).toBe(true);
      for (const script of SHARED_SCRIPTS) {
        expect(
          manifest.scripts?.[script],
          `${dir} script ${script}`,
        ).toBeTypeOf('string');
      }
    }
  });

  it('core exports TypeScript source rather than built output', () => {
    const core = manifests.get('packages/core');
    expect(core).toBeDefined();

    const paths = exportPaths(core?.exports);
    expect(paths.length).toBeGreaterThan(0);

    for (const path of paths) {
      expect(path).toMatch(/^\.\/src\/.+\.ts$/);
      expect(path).not.toContain('dist/');
    }
  });

  it('server depends on core via the workspace protocol', () => {
    const server = manifests.get('packages/server');
    const specifier = server?.dependencies?.['@chrysalyst/core'];

    expect(specifier).toBeDefined();
    expect(specifier?.startsWith('workspace:')).toBe(true);
  });

  it('packages reference catalog versions', () => {
    for (const [dir, manifest] of manifests) {
      for (const [name, specifier] of allDependencyEntries(manifest)) {
        if (name.startsWith(INTERNAL_PACKAGE_SCOPE)) {
          expect(specifier.startsWith('workspace:'), `${dir} -> ${name}`).toBe(
            true,
          );
          continue;
        }
        if (!catalogedTools.has(name)) continue;
        expect(specifier.startsWith('catalog:'), `${dir} -> ${name}`).toBe(
          true,
        );
      }
    }
  });

  it('root pins pnpm and an engine floor that can strip types', () => {
    const root = readManifest('package.json');

    expect(root.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+/);
    expect(root.engines?.node).toBe('^22.18.0 || >=24');

    const pinned = readText('.nvmrc').trim();
    const [major, minor] = pinned.split('.').map(Number);
    expect(
      major > 22 || (major === 22 && minor >= 18),
      `.nvmrc pins ${pinned}, which the engines.node floor must admit`,
    ).toBe(true);
  });

  it('root exposes the mission scripts without a build prerequisite', () => {
    const root = readManifest('package.json');
    const scripts = root.scripts ?? {};

    for (const script of ['dev', 'test', 'typecheck', 'lint', 'format']) {
      expect(scripts[script], `root script ${script}`).toBeTypeOf('string');
    }

    expect(scripts.test).not.toContain('build');
    expect(scripts.typecheck).not.toContain('build');
  });

  it('core declares no runtime dependencies and its non-test source imports none', () => {
    const core = manifests.get('packages/core');
    expect(Object.keys(core?.dependencies ?? {})).toHaveLength(0);

    const offenders: string[] = [];
    for (const file of nonTestSourceFiles('packages/core')) {
      for (const specifier of importedSpecifiers(readText(file))) {
        if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('dependency direction runs from server to core', () => {
    const server = manifests.get('packages/server');
    const core = manifests.get('packages/core');

    const serverDependsOnCore = allDependencyEntries(server ?? {}).some(
      ([name]) => name === '@chrysalyst/core',
    );
    expect(serverDependsOnCore).toBe(true);

    const coreInternalDeps = allDependencyEntries(core ?? {})
      .map(([name]) => name)
      .filter((name) => name.startsWith(INTERNAL_PACKAGE_SCOPE));
    expect(coreInternalDeps).toEqual([]);
  });

  it('web depends on neither core nor server', () => {
    const web = manifests.get('packages/web');
    const internalDeps = allDependencyEntries(web ?? {})
      .map(([name]) => name)
      .filter((name) => name.startsWith(INTERNAL_PACKAGE_SCOPE));

    expect(internalDeps).toEqual([]);
  });

  it('web source imports no @chrysalyst specifier', () => {
    const offenders: string[] = [];
    for (const file of filesUnder(
      'packages/web/src',
      (name) => name.endsWith('.ts') || name.endsWith('.tsx'),
    )) {
      for (const specifier of importedSpecifiers(readText(file))) {
        if (specifier.startsWith(INTERNAL_PACKAGE_SCOPE)) {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('every live test file gates on CHRYSALYST_LIVE_LLM and awaits nothing at module scope', () => {
    for (const file of liveTestFiles) {
      const source = readText(file);
      expect(
        skipIfGuardExpression(source),
        `${file} skipIf guard must read CHRYSALYST_LIVE_LLM`,
      ).toContain('CHRYSALYST_LIVE_LLM');
      expect(
        hasModuleScopeAwait(source),
        `${file} must not await at module scope`,
      ).toBe(false);
    }
  });

  it('every live guard expression skips for unset and empty and runs for any value', () => {
    for (const file of liveTestFiles) {
      const guard = skipIfGuardExpression(readText(file));
      expect(guardSkips(guard, undefined), `${file} guard on unset`).toBe(true);
      expect(guardSkips(guard, ''), `${file} guard on empty string`).toBe(true);
      expect(guardSkips(guard, '1'), `${file} guard on "1"`).toBe(false);
    }
  });
});
