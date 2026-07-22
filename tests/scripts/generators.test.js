#!/usr/bin/env node
'use strict';

/**
 * Phase 0 generator tests — frontmatter, registry, plugin-graph counts, idempotency.
 */

const { execSync } = require('node:child_process');
const {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
} = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');

const ROOT = join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function run(cmd, env = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  console.log('generator tests');

  await test('frontmatter parse + wikilinks', async () => {
    const mod = await import(pathToFileURL(join(ROOT, 'scripts/lib/frontmatter.mjs')).href);
    const { parseFrontmatter, extractWikilinks, inferLifecycle } = mod;
    const sample = `---
title: Demo
lifecycle: pre_official
keywords: [a, b]
related: [[other-doc]]
---

See [[other-doc]] and [[third]].
`;
    const { data, body, hasFm } = parseFrontmatter(sample);
    assert(hasFm, 'expected frontmatter');
    assert(data.title === 'Demo', `title=${data.title}`);
    assert(data.lifecycle === 'pre_official', `lifecycle=${data.lifecycle}`);
    assert(Array.isArray(data.keywords) && data.keywords.length === 2, 'keywords');
    const links = extractWikilinks(body);
    assert(links.includes('other-doc') && links.includes('third'), `links=${links}`);
    assert(inferLifecycle('docs/pre-official/research/x.md') === 'pre_official');
    assert(inferLifecycle('docs/SYSTEM_DESIGN.md') === 'official');
  });

  await test('register-project writes registry under LUNA_REGISTRY_DIR', () => {
    const dir = mkdtempSync(join(tmpdir(), 'luna-reg-'));
    try {
      run(`node scripts/register-project.mjs "${ROOT}"`, { LUNA_REGISTRY_DIR: dir });
      const regPath = join(dir, 'registry.json');
      assert(existsSync(regPath), 'registry.json missing');
      const reg = JSON.parse(readFileSync(regPath, 'utf8'));
      assert(reg.version === 1, 'version');
      assert(reg.projects.some((p) => p.id === 'luna-marketplace'), 'project entry');
      run(`node scripts/register-project.mjs "${ROOT}"`, { LUNA_REGISTRY_DIR: dir });
      const reg2 = JSON.parse(readFileSync(regPath, 'utf8'));
      assert(reg2.projects.filter((p) => p.id === 'luna-marketplace').length === 1, 'no dupes');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('build-plugin-graph counts match inventory', () => {
    run('node scripts/build-plugin-graph.mjs');
    const graph = JSON.parse(readFileSync(join(ROOT, 'docs/generated/plugin-graph.json'), 'utf8'));
    const skillDirs = readdirSync(join(ROOT, 'skills'), { withFileTypes: true }).filter(
      (d) => d.isDirectory() && existsSync(join(ROOT, 'skills', d.name, 'SKILL.md'))
    ).length;
    const agents = readdirSync(join(ROOT, 'agents')).filter((f) => f.endsWith('.md')).length;
    const hooks = JSON.parse(readFileSync(join(ROOT, 'hooks/hooks.json'), 'utf8'));
    const hookEvents = Object.keys(hooks.hooks || {}).length;
    assert(graph.counts.skills === skillDirs, `skills ${graph.counts.skills} != ${skillDirs}`);
    assert(graph.counts.agents === agents, `agents ${graph.counts.agents} != ${agents}`);
    assert(graph.counts.hook_events === hookEvents, `hooks ${graph.counts.hook_events} != ${hookEvents}`);
    assert(graph.counts.phases === 4, `phases ${graph.counts.phases}`);
    assert(existsSync(join(ROOT, 'docs/PLUGIN_MAP.md')), 'PLUGIN_MAP.md');
    assert(
      graph.health.broken_suggested_skills.length === 0,
      `broken suggests: ${graph.health.broken_suggested_skills}`
    );
  });

  await test('build-plugin-graph is idempotent on counts', () => {
    run('node scripts/build-plugin-graph.mjs');
    const a = JSON.parse(readFileSync(join(ROOT, 'docs/generated/plugin-graph.json'), 'utf8'));
    run('node scripts/build-plugin-graph.mjs');
    const b = JSON.parse(readFileSync(join(ROOT, 'docs/generated/plugin-graph.json'), 'utf8'));
    assert(JSON.stringify(a.counts) === JSON.stringify(b.counts), 'counts drifted');
    assert(a.edges.length === b.edges.length, 'edges drifted');
  });

  await test('build-docs-index flags health + writes llms.txt', () => {
    run('node scripts/build-docs-index.mjs');
    assert(existsSync(join(ROOT, 'docs/generated/docs-index.json')), 'docs-index.json');
    assert(existsSync(join(ROOT, 'llms.txt')), 'llms.txt');
    assert(existsSync(join(ROOT, 'docs/README.md')), 'README.md');
    const idx = JSON.parse(readFileSync(join(ROOT, 'docs/generated/docs-index.json'), 'utf8'));
    assert(idx.counts.docs > 0, 'docs count');
    assert(idx.counts.pre_official >= 1, 'pre_official bucket indexed');
    assert(Array.isArray(idx.health.broken_related), 'broken_related');
    assert(Array.isArray(idx.health.oversize_alert), 'oversize_alert');
    const readme = readFileSync(join(ROOT, 'docs/README.md'), 'utf8');
    assert(readme.includes('luna:generated:catalog:start'), 'catalog marker');
  });

  await test('build-knowledge aggregates after register', () => {
    const dir = mkdtempSync(join(tmpdir(), 'luna-know-'));
    try {
      run(`node scripts/register-project.mjs "${ROOT}"`, { LUNA_REGISTRY_DIR: dir });
      const other = mkdtempSync(join(tmpdir(), 'luna-proj-'));
      writeFileSync(join(other, 'AGENTS.md'), '# other\n');
      mkdirSync(join(other, 'docs'), { recursive: true });
      writeFileSync(
        join(other, 'docs', 'NOTE.md'),
        '---\ntitle: Note\nlifecycle: official\ntype: reference\n---\n\nHi\n'
      );
      run(`node scripts/register-project.mjs "${other}"`, { LUNA_REGISTRY_DIR: dir });
      run('node scripts/build-knowledge.mjs', { LUNA_REGISTRY_DIR: dir });
      const know = JSON.parse(readFileSync(join(ROOT, 'docs/generated/knowledge.json'), 'utf8'));
      assert(know.registry_projects >= 2, `registry_projects=${know.registry_projects}`);
      assert(know.counts.items > 0, 'items');
      rmSync(other, { recursive: true, force: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('detectAgents keys off tool-specific trees', async () => {
    const { registerProject, loadRegistry } = await import(
      pathToFileURL(join(ROOT, 'scripts/lib/luna-registry.mjs')).href
    );
    const dir = mkdtempSync(join(tmpdir(), 'luna-agents-'));
    try {
      process.env.LUNA_REGISTRY_DIR = dir;
      const onlyAgents = mkdtempSync(join(tmpdir(), 'luna-oa-'));
      writeFileSync(join(onlyAgents, 'AGENTS.md'), '# x\n');
      const { entry: e1 } = registerProject(onlyAgents);
      assert(!e1.agents.includes('cursor'), `unexpected cursor: ${e1.agents}`);
      assert(!e1.agents.includes('claude'), `unexpected claude without CLAUDE/.claude: ${e1.agents}`);

      const withClaude = mkdtempSync(join(tmpdir(), 'luna-cl-'));
      writeFileSync(join(withClaude, 'CLAUDE.md'), '# c\n');
      const { entry: e2 } = registerProject(withClaude);
      assert(e2.agents.includes('claude'), 'expected claude');
      assert(!e2.agents.includes('cursor'), 'no cursor without .cursor');

      mkdirSync(join(withClaude, '.cursor'));
      const { entry: e3 } = registerProject(withClaude);
      assert(e3.agents.includes('cursor'), 'expected cursor');
      rmSync(onlyAgents, { recursive: true, force: true });
      rmSync(withClaude, { recursive: true, force: true });
    } finally {
      delete process.env.LUNA_REGISTRY_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('llms.txt is derived from docs index', () => {
    run('node scripts/build-docs-index.mjs');
    const llms = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
    assert(llms.includes('generated'), 'should note generated');
    assert(llms.includes('docs/SYSTEM_DESIGN.md') || llms.includes('SYSTEM_DESIGN'), 'architecture path');
    assert(!llms.includes('docs/pre-official/ — concept / research'), 'old static lifecycle stub');
    const idx = JSON.parse(readFileSync(join(ROOT, 'docs/generated/docs-index.json'), 'utf8'));
    assert(typeof idx.health.missing_frontmatter.length === 'number', 'missing_fm surfaced in index');
  });

  await test('docs-index: H1 title fallback + content-aware --check fails on missing FM', () => {
    const dir = mkdtempSync(join(tmpdir(), 'luna-fm-'));
    try {
      mkdirSync(join(dir, 'docs', 'specs'), { recursive: true });
      // No front-matter, but an H1 → title should come from the heading, not "AGENTS".
      writeFileSync(join(dir, 'AGENTS.md'), '# My Kit — Contributor Guide\n\nbody\n');
      writeFileSync(join(dir, 'docs', 'README.md'), '# docs\n');
      // A spec doc missing front-matter → flagged + must fail --check.
      writeFileSync(join(dir, 'docs', 'specs', 'no-fm.md'), '# No FM spec\n\nbody\n');

      run(`node scripts/build-docs-index.mjs --root ${dir}`);
      const idx = JSON.parse(readFileSync(join(dir, 'docs/generated/docs-index.json'), 'utf8'));
      const agents = idx.docs.find((d) => d.path === 'AGENTS.md');
      assert(agents.title === 'My Kit — Contributor Guide', `H1 fallback, got ${agents.title}`);
      assert(
        idx.health.missing_frontmatter.includes('docs/specs/no-fm.md'),
        'missing-FM spec should be flagged',
      );

      let checkFailed = false;
      try {
        run(`node scripts/build-docs-index.mjs --check --root ${dir}`);
      } catch {
        checkFailed = true;
      }
      assert(checkFailed, '--check must fail when a durable doc lacks front-matter');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('--check passes after build', () => {
    run('node scripts/build-knowledge.mjs');
    run('node scripts/build-plugin-graph.mjs --check');
    run('node scripts/build-docs-index.mjs --check');
    run('node scripts/build-knowledge.mjs --check');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
