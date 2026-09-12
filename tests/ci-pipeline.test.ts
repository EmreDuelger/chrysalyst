import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import coreVitestConfig from '../packages/core/vitest.config.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WORKFLOW_DIR = '.github/workflows';
const CI_WORKFLOW = `${WORKFLOW_DIR}/ci.yml`;
const CORE_PACKAGE_DIR = 'packages/core';
const NODE_VERSION_FILE = '.nvmrc';
const ROOT_MANIFEST = 'package.json';

const LIVE_TIER_FLAG = 'CHRYSALYST_LIVE_LLM';
const WORKSPACE_ROOT_FLAG = '--include-workspace-root';
const MINIMUM_COVERAGE_PERCENT = 90;
const COVERAGE_METRICS = [
  'statements',
  'branches',
  'functions',
  'lines',
] as const;

const TRIGGER_KEY = /^(\s*)['"]?on['"]?:\s*(.*)$/;
const PERMISSIONS_KEY = /^(\s*)permissions:\s*(.*)$/;
const JOBS_KEY = /^(\s*)jobs:\s*(.*)$/;
const STEPS_KEY = /^(\s*)steps:\s*(.*)$/;
const STEP_ENTRY = /^\s*-\s+[\w-]+:/;
const RUN_LINE = /^\s*(?:-\s+)?run:\s*(.*)$/;
const USES_LINE = /^\s*(?:-\s+)?uses:/;
const PINNED_USES = /^\s*(?:-\s+)?uses:\s+\S+@[0-9a-f]{40}\s+#\s*v\S+/;
const PNPM_SETUP_ACTION = /^\s*(?:-\s+)?uses:\s*\S*pnpm\/setup\S*/;
const REQUIRE_LOCKFILE_INPUT = /^\s*require-lockfile:\s*true\s*$/;
const FROZEN_INSTALL_COMMAND = /^pnpm install\b.*--frozen-lockfile/;
const PINNED_VERSION_INPUT = /^\s*version:\s*\S/;
const LIVE_FLAG_ASSIGNMENT = new RegExp(`${LIVE_TIER_FLAG}\\s*[:=]\\s*(.*)$`);
const CONTINUE_ON_ERROR_KEY = /^\s*(?:-\s+)?continue-on-error:/;

interface WorkflowFile {
  readonly path: string;
  readonly text: string;
}

interface WorkflowLine {
  readonly path: string;
  readonly number: number;
  readonly text: string;
}

interface YamlBlock {
  readonly number: number;
  readonly indent: number;
  readonly inline: string;
  readonly body: readonly string[];
}

interface RunStep {
  readonly number: number;
  readonly command: string;
}

function readText(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function linesOf(text: string): readonly string[] {
  return text.split(/\r?\n/);
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(['"])(.*)\1$/.exec(trimmed);
  return quoted ? quoted[2] : trimmed;
}

/**
 * The CI workflow's text, after proving the file every workflow scenario reads
 * is present and carries content. Each of those scenarios enters through here,
 * so a missing or emptied `ci.yml` fails them rather than satisfying their
 * negative clauses by having nothing to violate them.
 */
function ciWorkflowText(): string {
  const path = join(repoRoot, CI_WORKFLOW);
  const text = existsSync(path) ? readText(CI_WORKFLOW) : '';
  expect(
    text.trim(),
    `${CI_WORKFLOW} must exist and declare a workflow`,
  ).not.toBe('');
  return text;
}

function workflowFiles(): readonly WorkflowFile[] {
  if (!existsSync(join(repoRoot, WORKFLOW_DIR))) return [];
  return readdirSync(join(repoRoot, WORKFLOW_DIR), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => {
      const path = `${WORKFLOW_DIR}/${entry.name}`;
      return { path, text: readText(path) };
    });
}

function workflowLines(
  files: readonly WorkflowFile[],
): readonly WorkflowLine[] {
  return files.flatMap((file) =>
    linesOf(file.text).map((text, index) => ({
      path: file.path,
      number: index + 1,
      text,
    })),
  );
}

/**
 * Every mapping entry whose key line matches `key`, paired with the lines
 * nested beneath it. Enough YAML shape to tie a value to the key that owns it
 * without taking on a parser dependency, which decision [8] rules out.
 */
function blocksNamed(
  lines: readonly string[],
  key: RegExp,
): readonly YamlBlock[] {
  const blocks: YamlBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    const match = key.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    const body: string[] = [];
    for (let scan = index + 1; scan < lines.length; scan++) {
      const line = lines[scan];
      if (line.trim() === '') continue;
      if (indentOf(line) <= indent) break;
      body.push(line);
    }
    blocks.push({ number: index + 1, indent, inline: match[2].trim(), body });
  }
  return blocks;
}

function topLevelBlock(
  lines: readonly string[],
  key: RegExp,
): YamlBlock | undefined {
  return blocksNamed(lines, key).find((block) => block.indent === 0);
}

/** A block the caller depends on, after proving the workflow declares it. */
function declaredBlock(block: YamlBlock | undefined, label: string): YamlBlock {
  expect(block, label).toBeDefined();
  return block as YamlBlock;
}

/**
 * The `key: value` pairs declared directly under a block, skipping anything
 * nested deeper, so a key named in a sub-mapping is not mistaken for a sibling.
 */
function directChildEntries(
  body: readonly string[],
): readonly (readonly [string, string])[] {
  const declared = body.filter((line) => line.trim() !== '');
  if (declared.length === 0) return [];
  const childIndent = Math.min(...declared.map(indentOf));
  const entries: (readonly [string, string])[] = [];
  for (const line of declared) {
    if (indentOf(line) !== childIndent) continue;
    const match = /^\s*['"]?([A-Za-z_][\w-]*)['"]?:\s*(.*)$/.exec(line);
    if (match) entries.push([match[1], unquote(match[2])]);
  }
  return entries;
}

/**
 * The event names a trigger block subscribes to, under either the block form
 * the plan specifies or the inline and sequence forms a later edit may use.
 */
function triggerNames(block: YamlBlock): readonly string[] {
  if (block.inline !== '') {
    return block.inline
      .replace(/[[\]]/g, '')
      .split(',')
      .map(unquote)
      .filter((name) => name !== '');
  }
  return directChildEntries(block.body).map(([name]) => name);
}

/**
 * The workflow step owning the line at `index`, from that line to the step's
 * last. Ties a `with:` input to the action it configures rather than to any
 * action in the file.
 */
function stepTailFrom(
  lines: readonly string[],
  index: number,
): readonly string[] {
  const indent = indentOf(lines[index]);
  const tail: string[] = [lines[index]];
  for (let scan = index + 1; scan < lines.length; scan++) {
    const line = lines[scan];
    if (line.trim() === '') continue;
    if (indentOf(line) < indent || /^\s*-\s/.test(line)) break;
    tail.push(line);
  }
  return tail;
}

function runSteps(lines: readonly string[]): readonly RunStep[] {
  const steps: RunStep[] = [];
  for (let index = 0; index < lines.length; index++) {
    const match = RUN_LINE.exec(lines[index]);
    if (match) steps.push({ number: index + 1, command: unquote(match[1]) });
  }
  return steps;
}

function lineRunning(
  steps: readonly RunStep[],
  command: string,
): number | undefined {
  return steps.find((step) => step.command === command)?.number;
}

function lineRunningWorkspaceTests(
  steps: readonly RunStep[],
): number | undefined {
  return steps.find(
    (step) =>
      step.command.includes(WORKSPACE_ROOT_FLAG) &&
      /(?:^|\s)test(?:\s|$)/.test(step.command),
  )?.number;
}

/**
 * The line of the step that installs the workspace from the committed
 * lockfile, or undefined when no step does. Two shapes qualify — a
 * `pnpm/setup` step carrying `require-lockfile: true`, or an explicit
 * `pnpm install --frozen-lockfile` command — because the clause's only textual
 * anchor is action-specific and task 2 may produce either shape.
 */
function frozenInstallLine(lines: readonly string[]): number | undefined {
  for (let index = 0; index < lines.length; index++) {
    if (
      PNPM_SETUP_ACTION.test(lines[index]) &&
      stepTailFrom(lines, index).some((line) =>
        REQUIRE_LOCKFILE_INPUT.test(line),
      )
    ) {
      return index + 1;
    }
    const run = RUN_LINE.exec(lines[index]);
    if (run && FROZEN_INSTALL_COMMAND.test(unquote(run[1]))) return index + 1;
  }
  return undefined;
}

function liveFlagAssignments(lines: readonly string[]): readonly string[] {
  return lines.filter((line) => {
    const match = LIVE_FLAG_ASSIGNMENT.exec(line);
    return match !== null && unquote(match[1]) !== '';
  });
}

function pinnedNodeVersion(): string | undefined {
  const trimmed = readText(NODE_VERSION_FILE).trim();
  return trimmed === '' ? undefined : trimmed;
}

function pinnedPnpmVersion(): string | undefined {
  const manifest = JSON.parse(readText(ROOT_MANIFEST)) as {
    packageManager?: string;
  };
  const match = /^pnpm@(\S+)$/.exec(manifest.packageManager ?? '');
  return match ? match[1] : undefined;
}

/**
 * A coverage glob as a whole-path matcher. `**` spans directory separators and
 * `*` stops at one, which is the distinction the floor turns on: `src/**\/*.ts`
 * reaches an untested module at any depth where `src/*.ts` would not.
 */
function globMatcher(glob: string): RegExp {
  const segments = glob.split('/');
  let source = '^';
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === '**') {
      source += last ? '.*' : '(?:[^/]+/)*';
      return;
    }
    source += segment
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    if (!last) source += '/';
  });
  return new RegExp(`${source}$`);
}

function matchesAnyGlob(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globMatcher(glob).test(path));
}

/** Every `.ts` file under `packages/core/src`, relative to the package root. */
function coreSourceFiles(): readonly string[] {
  const found: string[] = [];
  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(
      join(repoRoot, CORE_PACKAGE_DIR, relativeDir),
      { withFileTypes: true },
    )) {
      const path = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.name.endsWith('.ts')) found.push(path);
    }
  };
  walk('src');
  return found;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  expect(value, label).toBeTypeOf('object');
  expect(value, label).not.toBeNull();
  expect(Array.isArray(value), `${label} must be a mapping, not a list`).toBe(
    false,
  );
  return value as Record<string, unknown>;
}

function asStringList(value: unknown, label: string): readonly string[] {
  expect(Array.isArray(value), `${label} must be a list`).toBe(true);
  const items = value as readonly unknown[];
  expect(items.length, `${label} must not be empty`).toBeGreaterThan(0);
  for (const item of items) expect(item, `${label} entry`).toBeTypeOf('string');
  return items as readonly string[];
}

describe('ci pipeline', () => {
  it('runs on pull_request and not on push', () => {
    const lines = linesOf(ciWorkflowText());

    const trigger = declaredBlock(
      topLevelBlock(lines, TRIGGER_KEY),
      `${CI_WORKFLOW} must declare a trigger block`,
    );

    const events = triggerNames(trigger);
    expect(events, `${CI_WORKFLOW} triggers`).toContain('pull_request');
    expect(events, `${CI_WORKFLOW} triggers`).not.toContain('push');
  });

  it('installs before it checks, then lints, format-checks, typechecks and tests the workspace root in order', () => {
    const lines = linesOf(ciWorkflowText());
    const steps = runSteps(lines);

    const testLine = lineRunningWorkspaceTests(steps);
    expect(
      testLine,
      `${CI_WORKFLOW} must run the workspace tests including the root, via ${WORKSPACE_ROOT_FLAG}`,
    ).toBeDefined();

    const lintLine = lineRunning(steps, 'pnpm lint');
    const formatLine = lineRunning(steps, 'pnpm format:check');
    const typecheckLine = lineRunning(steps, 'pnpm typecheck');
    expect(lintLine, `${CI_WORKFLOW} must run pnpm lint`).toBeDefined();
    expect(
      formatLine,
      `${CI_WORKFLOW} must run pnpm format:check`,
    ).toBeDefined();
    expect(
      typecheckLine,
      `${CI_WORKFLOW} must run pnpm typecheck`,
    ).toBeDefined();

    const installLine = frozenInstallLine(lines);
    expect(
      installLine,
      `${CI_WORKFLOW} must install the workspace, through a pnpm/setup step with require-lockfile: true or a pnpm install --frozen-lockfile step`,
    ).toBeDefined();

    const sequence: readonly (readonly [string, number | undefined])[] = [
      ['install', installLine],
      ['pnpm lint', lintLine],
      ['pnpm format:check', formatLine],
      ['pnpm typecheck', typecheckLine],
      ['workspace test', testLine],
    ];
    expect(
      [...sequence]
        .sort(([, a], [, b]) => Number(a) - Number(b))
        .map(([label]) => label),
      `${CI_WORKFLOW} must install, then lint, format-check, typecheck and test in that order`,
    ).toEqual(sequence.map(([label]) => label));
  });

  it('reads .nvmrc and restates neither the node nor the pnpm version, and installs against a frozen lockfile', () => {
    const text = ciWorkflowText();
    const lines = linesOf(text);

    const nodeVersion = pinnedNodeVersion();
    const pnpmVersion = pinnedPnpmVersion();
    expect(
      nodeVersion,
      `${NODE_VERSION_FILE} must pin a Node version`,
    ).toBeDefined();
    expect(
      pnpmVersion,
      `${ROOT_MANIFEST} packageManager must pin a pnpm version`,
    ).toBeDefined();
    expect(nodeVersion, `${NODE_VERSION_FILE} must pin a Node version`).toMatch(
      /^\d+\.\d+\.\d+/,
    );
    expect(
      pnpmVersion,
      `${ROOT_MANIFEST} packageManager must pin a pnpm version`,
    ).toMatch(/^\d+\.\d+\.\d+/);

    expect(
      text,
      `${CI_WORKFLOW} must take the Node version from ${NODE_VERSION_FILE}`,
    ).toContain(NODE_VERSION_FILE);
    expect(
      text,
      `${CI_WORKFLOW} must not restate the Node version ${NODE_VERSION_FILE} owns`,
    ).not.toContain(nodeVersion);
    expect(
      text,
      `${CI_WORKFLOW} must not restate the pnpm version packageManager owns`,
    ).not.toContain(pnpmVersion);

    expect(
      frozenInstallLine(lines),
      `${CI_WORKFLOW} must install from the committed lockfile rather than rewrite it`,
    ).toBeDefined();

    expect(
      lines.filter((line) => PINNED_VERSION_INPUT.test(line)),
      `${CI_WORKFLOW} must let the action read packageManager instead of pinning a version input`,
    ).toEqual([]);
  });

  it('every uses in .github/workflows names a 40-hex sha with a version comment', () => {
    const files = workflowFiles();
    expect(
      files.map((file) => file.path),
      `${WORKFLOW_DIR} must hold the CI workflow`,
    ).toContain(CI_WORKFLOW);

    const references = workflowLines(files).filter((line) =>
      USES_LINE.test(line.text),
    );
    expect(
      references.filter((line) => line.path === CI_WORKFLOW).length,
      `${CI_WORKFLOW} must use at least one action`,
    ).toBeGreaterThan(0);

    const unpinned = references
      .filter((line) => !PINNED_USES.test(line.text))
      .map(
        (line) => `${line.path}:${line.number.toString()} ${line.text.trim()}`,
      );
    expect(unpinned).toEqual([]);
  });

  it('sets CHRYSALYST_LIVE_LLM nowhere in the workflow', () => {
    const lines = linesOf(ciWorkflowText());

    expect(
      liveFlagAssignments(lines).map((line) => line.trim()),
      `${CI_WORKFLOW} must leave ${LIVE_TIER_FLAG} unset, because the runner has no language model`,
    ).toEqual([]);
  });

  it('declares no continue-on-error on any ci.yml step', () => {
    const lines = linesOf(ciWorkflowText());

    expect(
      topLevelBlock(lines, JOBS_KEY),
      `${CI_WORKFLOW} must declare a jobs block`,
    ).toBeDefined();
    expect(
      blocksNamed(lines, STEPS_KEY).length,
      `${CI_WORKFLOW} must declare a steps block`,
    ).toBeGreaterThan(0);
    expect(
      lines.filter((line) => STEP_ENTRY.test(line)).length,
      `${CI_WORKFLOW} must declare at least one step`,
    ).toBeGreaterThan(0);

    expect(
      lines
        .filter((line) => CONTINUE_ON_ERROR_KEY.test(line))
        .map((line) => line.trim()),
      `${CI_WORKFLOW} must let every failed check fail the run`,
    ).toEqual([]);
  });

  it('declares contents: read and grants no write permission', () => {
    const lines = linesOf(ciWorkflowText());

    const permissionBlocks = blocksNamed(lines, PERMISSIONS_KEY);

    declaredBlock(
      topLevelBlock(lines, PERMISSIONS_KEY),
      `${CI_WORKFLOW} must declare a permissions block`,
    );
    expect(
      permissionBlocks
        .filter((block) => block.inline !== '')
        .map((block) => `${block.number.toString()}: ${block.inline}`),
      `${CI_WORKFLOW} permissions must name each scope rather than grant them wholesale, at workflow and job scope alike`,
    ).toEqual([]);

    const grants = permissionBlocks.flatMap((block) =>
      directChildEntries(block.body),
    );
    expect(
      grants.length,
      `${CI_WORKFLOW} permissions block must name at least one scope`,
    ).toBeGreaterThan(0);

    expect(
      grants.find(([scope]) => scope === 'contents')?.[1],
      `${CI_WORKFLOW} must grant contents: read`,
    ).toBe('read');
    expect(
      grants.filter(([, access]) => access.includes('write')),
      `${CI_WORKFLOW} reports checks and publishes nothing, so it must grant no write`,
    ).toEqual([]);
  });

  it('core collects coverage over all of src without a flag and floors all four metrics at ninety', () => {
    const config = asRecord(
      coreVitestConfig,
      `${CORE_PACKAGE_DIR}/vitest.config.ts default export`,
    );

    const test = asRecord(config.test, `${CORE_PACKAGE_DIR} test config`);
    expect(
      config.coverage,
      `${CORE_PACKAGE_DIR} declares coverage under test:, because Vitest ignores a top-level coverage block in silence`,
    ).toBeUndefined();

    const coverage = asRecord(
      test.coverage,
      `${CORE_PACKAGE_DIR} test.coverage`,
    );
    expect(
      coverage.enabled,
      `${CORE_PACKAGE_DIR} must collect coverage without a command-line flag`,
    ).toBe(true);

    const sources = coreSourceFiles();
    expect(
      sources.length,
      `${CORE_PACKAGE_DIR}/src must hold TypeScript sources for the floor to measure`,
    ).toBeGreaterThan(0);

    const include = asStringList(
      coverage.include,
      `${CORE_PACKAGE_DIR} test.coverage.include`,
    );
    expect(
      sources.filter((path) => !matchesAnyGlob(path, include)),
      `${CORE_PACKAGE_DIR} must measure every file under src, so an untested module lowers the number`,
    ).toEqual([]);

    const typeTests = sources.filter((path) => path.endsWith('.test-d.ts'));
    expect(
      typeTests.length,
      `${CORE_PACKAGE_DIR}/src must hold the type tests this exclude exists for`,
    ).toBeGreaterThan(0);

    const exclude = asStringList(
      coverage.exclude,
      `${CORE_PACKAGE_DIR} test.coverage.exclude`,
    );
    expect(
      typeTests.filter((path) => !matchesAnyGlob(path, exclude)),
      `${CORE_PACKAGE_DIR} must exclude type tests, which execute nothing and would read as uncovered source`,
    ).toEqual([]);

    const thresholds = asRecord(
      coverage.thresholds,
      `${CORE_PACKAGE_DIR} test.coverage.thresholds`,
    );
    for (const metric of COVERAGE_METRICS) {
      const floor = thresholds[metric];
      expect(floor, `${CORE_PACKAGE_DIR} coverage floor ${metric}`).toBeTypeOf(
        'number',
      );
      expect(
        floor as number,
        `${CORE_PACKAGE_DIR} coverage floor ${metric}`,
      ).toBeGreaterThanOrEqual(MINIMUM_COVERAGE_PERCENT);
    }
  });
});
