#!/usr/bin/env node
/**
 * Phase 1 loader validation without compiling TypeScript.
 * Mirrors studio/src/lib/data.ts discovery rules + constellation edge honesty.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.LUNA_PLUGIN_ROOT || join(HERE, '../..'));
const STUDIO = resolve(process.env.LUNA_STUDIO_ROOT || join(ROOT, 'studio'));
const FIXTURES = process.env.LUNA_STUDIO_FIXTURES === '1' || process.env.LUNA_STUDIO_FIXTURES === 'on';

function loadRegistry() {
  const dir = process.env.LUNA_REGISTRY_DIR || join(homedir(), '.claude', 'luna');
  const path = join(dir, 'registry.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')).projects || [];
}

function loadFixtures() {
  if (!FIXTURES) return [];
  const dir = join(STUDIO, 'fixtures');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() && (existsSync(join(p, 'AGENTS.md')) || existsSync(join(p, 'docs')));
    })
    .map((name) => ({ id: name, path: join(dir, name), source: 'fixture' }));
}

const projects = new Map();
const pluginId = basename(ROOT);
projects.set(pluginId, { id: pluginId, source: 'plugin', path: ROOT });
for (const p of loadRegistry()) {
  if (p.id === pluginId || resolve(p.path || '') === resolve(ROOT)) {
    projects.set(pluginId, { ...projects.get(pluginId), ...p, path: ROOT, source: 'plugin' });
    continue;
  }
  projects.set(p.id, { ...p, source: 'registry' });
}
for (const p of loadFixtures()) {
  if (!projects.has(p.id)) projects.set(p.id, p);
}

const list = [...projects.values()];
if (list.length < 2) {
  console.error(`FAIL expected ≥2 projects, got ${list.length}. Set LUNA_STUDIO_FIXTURES=1`);
  process.exit(1);
}

const graphPath = join(ROOT, 'docs/generated/plugin-graph.json');
const docsPath = join(ROOT, 'docs/generated/docs-index.json');
if (!existsSync(graphPath) || !existsSync(docsPath)) {
  console.error('FAIL missing plugin-graph.json or docs-index.json — run npm run build:indexes');
  process.exit(1);
}

const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const docs = JSON.parse(readFileSync(docsPath, 'utf8'));
if (!graph.counts?.skills || !docs.counts?.docs) {
  console.error('FAIL empty indexes');
  process.exit(1);
}

const fixture = list.find((p) => p.source === 'fixture');
if (!fixture) {
  console.error('FAIL fixture project missing');
  process.exit(1);
}

const { buildConstellationEdges, assertHonestEdges } = await import(
  pathToFileURL(join(STUDIO, 'src/lib/constellation.ts')).href
);

const edges = buildConstellationEdges(list);
const honesty = assertHonestEdges(edges);
if (honesty.length) {
  console.error(`FAIL dishonest edges: ${honesty.join('; ')}`);
  process.exit(1);
}
if (edges.some((e) => e.label.startsWith('module:') || e.label.startsWith('shared:'))) {
  console.error('FAIL coincidental/agent labels must not be emitted');
  process.exit(1);
}
const kit = edges.filter((e) => e.kind === 'kit');
const sub = edges.filter((e) => e.kind === 'submodule');
if (kit.length < 1) {
  console.error('FAIL expected ≥1 kit hierarchy edge');
  process.exit(1);
}
if (sub.length < 1) {
  console.error('FAIL expected ≥1 submodule overlap edge (fixture shares ECC remote)');
  process.exit(1);
}

console.log(
  `studio loaders ok: projects=${list.length} kit=${kit.length} submodule=${sub.length} skills=${graph.counts.skills} docs=${docs.counts.docs} fixture=${fixture.id}`
);
