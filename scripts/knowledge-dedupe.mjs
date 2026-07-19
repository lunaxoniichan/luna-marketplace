#!/usr/bin/env node
/**
 * knowledge-dedupe CLI — read-only lexical overlap report.
 * Contract: docs/specs/2026-07-19-dedupe-assistant-contract.md
 *
 * Usage:
 *   node scripts/knowledge-dedupe.mjs --vault-id <id> [--scope vault|vault+plugin|registry]
 *   node scripts/knowledge-dedupe.mjs --check-fixture   # hermetic self-check (no I/O writes)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { buildReport, filterCorpus } from './lib/knowledge-dedupe.mjs';
import { GENERATED_MARKER } from './lib/agent-views.mjs';

function pluginRoot() {
  if (process.env.LUNA_PLUGIN_ROOT) return resolve(process.env.LUNA_PLUGIN_ROOT);
  return resolve(process.cwd());
}

function checkFixture() {
  const corpus = [
    {
      project_id: 'fixture',
      path: 'docs/specs/a.md',
      kind: 'spec',
      title: 'Shared topic',
      keywords: ['shared', 'topic', 'fixture'],
      excerpt: 'Shared topic fixture documentation.',
    },
    {
      project_id: 'fixture',
      path: 'memory/a.md',
      kind: 'memory',
      title: 'Shared topic notes',
      keywords: ['shared', 'topic', 'fixture'],
      excerpt: 'Shared topic fixture memory notes.',
    },
    {
      project_id: 'fixture',
      path: 'rules/core.md',
      kind: 'rule',
      title: 'Core',
      keywords: ['core', 'rules'],
      excerpt: 'Canonical core.',
    },
    {
      project_id: 'fixture',
      path: '.claude/rules/core.md',
      kind: 'rule',
      title: 'Core',
      keywords: ['shared', 'topic', 'fixture'],
      excerpt: `<!-- ${GENERATED_MARKER} --> mirror`,
    },
  ];
  const filtered = filterCorpus(corpus);
  if (filtered.some((i) => i.path.startsWith('.claude/rules/') && !i.path.endsWith('lessons.md'))) {
    console.error('FAIL: generated mirror not filtered');
    process.exit(1);
  }
  const report = buildReport(corpus, {
    scope: { mode: 'vault', vaultId: 'fixture' },
    generatedAt: '2026-07-19T00:00:00.000Z',
  });
  const hit = report.clusters.find(
    (c) =>
      c.items.some((i) => i.path === 'docs/specs/a.md') &&
      c.items.some((i) => i.path === 'memory/a.md'),
  );
  if (!hit) {
    console.error('FAIL: expected overlap cluster');
    process.exit(1);
  }
  if (hit.items.some((i) => i.path.includes('.claude/rules'))) {
    console.error('FAIL: cluster includes generated path');
    process.exit(1);
  }
  console.log('check-fixture ok');
  console.log(`  clusters=${report.clusters.length} score=${hit.score.toFixed(3)}`);
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--check-fixture')) {
    checkFixture();
    return;
  }

  const idIdx = args.indexOf('--vault-id');
  const vaultId = idIdx >= 0 ? args[idIdx + 1] : basename(pluginRoot());
  const scopeIdx = args.indexOf('--scope');
  const scopeMode = scopeIdx >= 0 ? args[scopeIdx + 1] : 'vault';

  if (!['vault', 'vault+plugin', 'registry'].includes(scopeMode)) {
    console.error('scope must be vault|vault+plugin|registry');
    process.exit(2);
  }

  const root = pluginRoot();
  const knowledgePath = join(root, 'docs/generated/knowledge.json');
  if (!existsSync(knowledgePath)) {
    console.error('knowledge.json missing — run: node scripts/build-knowledge.mjs');
    process.exit(1);
  }
  const knowledge = JSON.parse(readFileSync(knowledgePath, 'utf8'));
  const pluginProjectId =
    (knowledge.projects || []).find((p) => p.scope_role?.includes('plugin'))?.id ||
    basename(root);

  const report = buildReport(knowledge.items || [], {
    scope: { mode: scopeMode, vaultId },
    pluginProjectId,
  });
  console.log(JSON.stringify(report, null, 2));
}

main();
