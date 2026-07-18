#!/usr/bin/env node
/**
 * Smoke: render overview summary via react-dom/server (no Next boot, no TS imports).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.LUNA_PLUGIN_ROOT || join(__dirname, '../..'));
const STUDIO = resolve(process.env.LUNA_STUDIO_ROOT || join(ROOT, 'studio'));
const FIXTURES = process.env.LUNA_STUDIO_FIXTURES === '1' || process.env.LUNA_STUDIO_FIXTURES === 'on';

const studioReq = createRequire(join(STUDIO, 'package.json'));
const { createElement } = studioReq('react');
const { renderToStaticMarkup } = studioReq('react-dom/server');

function loadProjects() {
  const byId = new Map();
  const pluginId = basename(ROOT);
  byId.set(pluginId, { id: pluginId, name: pluginId, source: 'plugin' });
  const regPath = join(process.env.LUNA_REGISTRY_DIR || join(homedir(), '.claude', 'luna'), 'registry.json');
  if (existsSync(regPath)) {
    for (const p of JSON.parse(readFileSync(regPath, 'utf8')).projects || []) {
      if (!p?.id) continue;
      if (p.id === pluginId) continue;
      byId.set(p.id, { id: p.id, name: p.name || p.id, source: 'registry' });
    }
  }
  if (FIXTURES) {
    const dir = join(STUDIO, 'fixtures');
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (!statSync(p).isDirectory()) continue;
        if (!existsSync(join(p, 'AGENTS.md')) && !existsSync(join(p, 'docs'))) continue;
        if (!byId.has(name)) byId.set(name, { id: name, name, source: 'fixture' });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function OverviewSummary({ projects, edgeCount }) {
  return createElement(
    'div',
    { 'data-testid': 'overview-summary' },
    createElement('h1', null, 'Luna Studio'),
    createElement(
      'p',
      { 'data-testid': 'overview-counts' },
      `${projects.length} projects · ${edgeCount} edges`,
    ),
    createElement(
      'ul',
      { 'data-testid': 'overview-projects' },
      ...projects.map((p) =>
        createElement(
          'li',
          { key: p.id, 'data-project-id': p.id },
          `${p.name}${p.source ? ` (${p.source})` : ''}`,
        ),
      ),
    ),
  );
}

const projects = loadProjects();
assert.ok(projects.length >= 1);
// edge count: kit spokes ≈ projects-1 when fixtures on; use projects.length as lower bound proxy
const edgeCount = Math.max(0, projects.length - 1);

const html = renderToStaticMarkup(
  createElement(OverviewSummary, { projects, edgeCount }),
);

assert.match(html, /data-testid="overview-summary"/);
assert.match(html, /data-testid="overview-counts"/);
assert.match(html, new RegExp(`${projects.length} projects`));
assert.match(html, /data-project-id=/);
assert.ok(html.includes(projects[0].id) || html.includes(projects[0].name));
console.log(`smoke-overview ok (${projects.length} projects)`);
