#!/usr/bin/env node
/**
 * build-knowledge.mjs — aggregate knowledge across registered projects + plugin (user scope).
 *
 * Reuses detect-modules heuristics for per-project modules.
 *
 * Usage:
 *   node scripts/build-knowledge.mjs
 *   node scripts/build-knowledge.mjs --check
 *   node scripts/build-knowledge.mjs --root <plugin-root>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { parseFrontmatter, inferLifecycle, inferType, extractWikilinks } from './lib/frontmatter.mjs';
import { walkMarkdown } from './lib/md-walk.mjs';
import { loadRegistry } from './lib/luna-registry.mjs';

const GENERATED_DIR = 'docs/generated';
const JSON_OUT = join(GENERATED_DIR, 'knowledge.json');

function detectModules(root) {
  const MARKERS = ['CLAUDE.md', 'AGENTS.md'];
  const SKIP = new Set([
    'node_modules', '.git', '.cursor', '.claude', '__pycache__',
    'dist', 'build', '.next', '.venv', 'venv', 'volume', 'fork',
  ]);
  if (!existsSync(root)) return [];
  const modules = [];
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || SKIP.has(ent.name) || ent.name.startsWith('.')) continue;
    const dirPath = join(root, ent.name);
    const found = MARKERS.filter((m) => existsSync(join(dirPath, m)));
    if (found.length) modules.push({ name: ent.name, path: dirPath, markers: found });
  }
  return modules.sort((a, b) => a.name.localeCompare(b.name));
}

function collectScope(root, scope, projectId) {
  const items = [];
  const paths = [
    { under: 'docs', label: 'docs' },
    { under: 'rules', label: 'rules' },
  ];
  for (const mem of ['memory', join('.claude', 'memory')]) {
    if (existsSync(join(root, mem))) paths.push({ under: mem, label: 'memory' });
  }

  for (const p of paths) {
    const files = walkMarkdown(root, { under: p.under });
    for (const f of files) {
      if (f.rel.includes('/_archive/') || f.rel.includes('/generated/')) continue;
      const { data, body, hasFm } = parseFrontmatter(f.text);
      items.push({
        project_id: projectId,
        scope: data.scope || scope,
        kind: p.label === 'rules' ? 'rule' : p.label === 'memory' ? 'memory' : (data.type || inferType(f.rel)),
        path: f.rel,
        title: data.title || basename(f.rel, '.md'),
        lifecycle: data.lifecycle || inferLifecycle(f.rel),
        status: data.status || 'active',
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        related: Array.isArray(data.related) ? data.related : [],
        wikilinks: extractWikilinks(body),
        lines: f.lines,
        has_frontmatter: hasFm,
        excerpt: body.replace(/\s+/g, ' ').trim().slice(0, 240),
        canonical: true,
      });
    }
  }

  const lessons = join(root, '.claude', 'rules', 'lessons.md');
  if (existsSync(lessons) && !items.some((i) => i.path.endsWith('lessons.md'))) {
    const text = readFileSync(lessons, 'utf8');
    items.push({
      project_id: projectId,
      scope,
      kind: 'lesson',
      path: '.claude/rules/lessons.md',
      title: 'lessons',
      lifecycle: 'official',
      status: 'active',
      keywords: ['lessons', 'corrections'],
      related: [],
      wikilinks: [],
      lines: text.split(/\r?\n/).length,
      has_frontmatter: false,
      excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 240),
      canonical: true,
    });
  }

  return items;
}

function buildKnowledge(pluginRoot) {
  const reg = loadRegistry();
  const projects = [];
  const items = [];

  const pluginId = basename(pluginRoot);
  const pluginItems = collectScope(pluginRoot, 'user', pluginId);
  items.push(...pluginItems);
  projects.push({
    id: pluginId,
    path: pluginRoot,
    scope_role: 'plugin',
    modules: detectModules(pluginRoot).map((m) => m.name),
    item_count: pluginItems.length,
  });

  for (const p of reg.projects || []) {
    const path = p.path;
    if (!path || !existsSync(path)) {
      projects.push({
        id: p.id,
        path,
        scope_role: 'project',
        status: 'missing',
        modules: [],
        item_count: 0,
      });
      continue;
    }
    if (resolve(path) === resolve(pluginRoot)) {
      const existing = projects.find((x) => x.id === pluginId);
      if (existing) existing.scope_role = 'plugin+project';
      continue;
    }
    const collected = collectScope(path, 'project', p.id || basename(path));
    items.push(...collected);
    projects.push({
      id: p.id || basename(path),
      path,
      scope_role: 'project',
      status: p.status || 'active',
      modules: detectModules(path).map((m) => m.name),
      item_count: collected.length,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    // Do not embed absolute machine paths — registry location is env-resolved at read time.
    registry: 'LUNA_REGISTRY_DIR|~/.claude/luna/registry.json',
    registry_projects: (reg.projects || []).length,
    projects,
    counts: {
      items: items.length,
      by_kind: items.reduce((acc, i) => {
        acc[i.kind] = (acc[i.kind] || 0) + 1;
        return acc;
      }, {}),
      by_scope: items.reduce((acc, i) => {
        acc[i.scope] = (acc[i.scope] || 0) + 1;
        return acc;
      }, {}),
    },
    items,
  };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const rootIdx = args.indexOf('--root');
  const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : process.cwd());

  const knowledge = buildKnowledge(root);
  const json = JSON.stringify(knowledge, null, 2) + '\n';
  const jsonPath = join(root, JSON_OUT);

  if (check) {
    if (!existsSync(jsonPath)) {
      console.error('knowledge.json missing — run: node scripts/build-knowledge.mjs');
      process.exit(1);
    }
    try {
      const prev = JSON.parse(readFileSync(jsonPath, 'utf8'));
      // Registry is user-local and can change between runs — compare plugin-scope only.
      const pluginId = basename(root);
      const prevPlugin = (prev.items || []).filter((i) => i.project_id === pluginId).length;
      const nextPlugin = (knowledge.items || []).filter((i) => i.project_id === pluginId).length;
      if (prevPlugin !== nextPlugin) {
        console.error(
          `knowledge.json plugin items drifted (${prevPlugin} → ${nextPlugin}) — run: node scripts/build-knowledge.mjs`
        );
        process.exit(1);
      }
    } catch (err) {
      console.error(`knowledge.json unreadable — regenerate (${err.message})`);
      process.exit(1);
    }
    console.log(
      `knowledge ok (items=${knowledge.counts.items} registry_projects=${knowledge.registry_projects})`
    );
    process.exit(0);
  }

  mkdirSync(join(root, GENERATED_DIR), { recursive: true });
  writeFileSync(jsonPath, json, 'utf8');
  console.log(`Wrote ${JSON_OUT}`);
  console.log(
    `  items=${knowledge.counts.items} projects=${knowledge.projects.length} registry=${knowledge.registry_projects}`
  );
}

main();
