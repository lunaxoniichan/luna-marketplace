#!/usr/bin/env node
/**
 * build-docs-index.mjs — scan docs → docs-index.json + llms.txt + README catalog markers.
 *
 * Marker/preserve pattern (like build-plans-registry.mjs):
 *   Human sections outside <!-- luna:generated:* --> markers are preserved.
 *   Catalog rows between markers are regenerated from front-matter / path inference.
 *
 * Usage:
 *   node scripts/build-docs-index.mjs
 *   node scripts/build-docs-index.mjs --check
 *   node scripts/build-docs-index.mjs --root <path>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseFrontmatter,
  inferLifecycle,
  inferType,
  extractWikilinks,
} from './lib/frontmatter.mjs';
import { walkMarkdown } from './lib/md-walk.mjs';

const GENERATED_DIR = 'docs/generated';
const JSON_OUT = join(GENERATED_DIR, 'docs-index.json');
const README = 'docs/README.md';
const LLMS = 'llms.txt';

const WARN_LINES = Number(process.env.LUNA_FILE_SIZE_WARN_LINES || 300);
const ALERT_LINES = Number(process.env.LUNA_FILE_SIZE_ALERT_LINES || 500);

const CATALOG_START = '<!-- luna:generated:catalog:start -->';
const CATALOG_END = '<!-- luna:generated:catalog:end -->';
const HEALTH_START = '<!-- luna:generated:health:start -->';
const HEALTH_END = '<!-- luna:generated:health:end -->';

function slugFromPath(rel) {
  return basename(rel, '.md').toLowerCase().replace(/_/g, '-');
}

function titleFrom(data, rel) {
  if (data.title) return String(data.title);
  const base = basename(rel, '.md');
  return base.replace(/[-_]/g, ' ');
}

function buildIndex(root) {
  const files = walkMarkdown(root, { under: 'docs' });
  // also include AGENTS.md at root as entry
  const agentsPath = join(root, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    const text = readFileSync(agentsPath, 'utf8');
    files.unshift({
      abs: agentsPath,
      rel: 'AGENTS.md',
      lines: text.split(/\r?\n/).length,
      text,
    });
  }

  const docs = [];
  const bySlug = new Map();

  for (const f of files) {
    // skip generated artifacts and archive
    if (f.rel.startsWith('docs/generated/')) continue;
    if (f.rel.includes('/_archive/')) continue;
    if (f.rel === 'docs/PLUGIN_MAP.md') continue; // generated

    const { data, body, hasFm } = parseFrontmatter(f.text);
    const lifecycle = data.lifecycle || inferLifecycle(f.rel);
    const type = data.type || inferType(f.rel);
    const slug = String(data.slug || slugFromPath(f.rel));
    const related = Array.isArray(data.related)
      ? data.related.map(String)
      : typeof data.related === 'string'
        ? [data.related]
        : [];
    const wikilinks = extractWikilinks(body);
    const keywords = Array.isArray(data.keywords)
      ? data.keywords.map(String)
      : [];

    const entry = {
      path: f.rel,
      slug,
      title: titleFrom(data, f.rel),
      scope: data.scope || (f.rel === 'AGENTS.md' ? 'user' : 'project'),
      type,
      lifecycle,
      status: data.status || 'active',
      keywords,
      related,
      wikilinks,
      supersedes: data.supersedes || null,
      superseded_by: data.superseded_by || null,
      updated: data.updated || null,
      lines: f.lines,
      has_frontmatter: hasFm,
    };
    docs.push(entry);
    bySlug.set(slug, entry);
    bySlug.set(f.rel, entry);
    bySlug.set(basename(f.rel, '.md'), entry);
  }

  const health = { oversize_warn: [], oversize_alert: [], broken_related: [], missing_frontmatter: [] };

  for (const d of docs) {
    if (d.lines > ALERT_LINES) health.oversize_alert.push({ path: d.path, lines: d.lines });
    else if (d.lines > WARN_LINES) health.oversize_warn.push({ path: d.path, lines: d.lines });
    if (!d.has_frontmatter && d.path.startsWith('docs/') && !d.path.endsWith('/README.md')) {
      // Generated registries are rewritten by scripts — don't nag for FM.
      if (d.path === 'docs/PLANS.md' || d.path === 'docs/TODO.md' || d.path === 'docs/PLUGIN_MAP.md') {
        // skip
      } else if (
        d.type === 'spec' ||
        d.type === 'plan' ||
        d.type === 'decision' ||
        d.type === 'memory' ||
        d.type === 'architecture'
      ) {
        health.missing_frontmatter.push(d.path);
      }
    }
    for (const r of [...d.related, ...d.wikilinks]) {
      const key = String(r).replace(/^\[\[|\]\]$/g, '').trim();
      if (!key) continue;
      if (!bySlug.has(key) && !bySlug.has(key.toLowerCase())) {
        // also try path-ish
        const hit = docs.find(
          (x) =>
            x.slug === key ||
            x.path === key ||
            x.path.endsWith(`/${key}.md`) ||
            x.path.endsWith(`/${key}`) ||
            basename(x.path, '.md') === key
        );
        if (!hit) health.broken_related.push({ from: d.path, related: key });
      }
    }
  }

  const byLifecycle = { pre_official: 0, official: 0, post_official: 0 };
  for (const d of docs) {
    if (byLifecycle[d.lifecycle] !== undefined) byLifecycle[d.lifecycle]++;
  }

  return {
    generated_at: new Date().toISOString(),
    root: basename(root),
    counts: { docs: docs.length, ...byLifecycle },
    docs,
    health,
  };
}

function renderCatalogRows(index) {
  const rows = [
    '| File | Role | Lifecycle | Agent keywords |',
    '|------|------|-----------|----------------|',
  ];
  const sorted = [...index.docs]
    .filter((d) => d.path.startsWith('docs/') || d.path === 'AGENTS.md')
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const d of sorted) {
    if (d.path.includes('/generated/')) continue;
    const link =
      d.path === 'AGENTS.md'
        ? '[`AGENTS.md`](../AGENTS.md)'
        : `[\`${d.path.replace(/^docs\//, '')}\`](${d.path.replace(/^docs\//, '')})`;
    const role = `**${d.type}** — ${d.title}`;
    const kw = d.keywords.length ? d.keywords.join(', ') : '—';
    rows.push(`| ${link} | ${role} | ${d.lifecycle} | ${kw} |`);
  }
  return rows.join('\n');
}

function renderHealth(index) {
  const lines = ['### Generated health', ''];
  const h = index.health;
  lines.push(
    `- Oversize alert (>${ALERT_LINES}): **${h.oversize_alert.length}** · warn (>${WARN_LINES}): **${h.oversize_warn.length}**`
  );
  lines.push(`- Broken \`related\` / wikilinks: **${h.broken_related.length}**`);
  lines.push(`- Missing front-matter (spec/plan/decision/memory): **${h.missing_frontmatter.length}**`);
  if (h.oversize_alert.length) {
    lines.push('');
    lines.push('Alerts:');
    for (const x of h.oversize_alert.slice(0, 10)) {
      lines.push(`- \`${x.path}\` (${x.lines} lines) — run \`doc-simplify\``);
    }
  }
  if (h.broken_related.length) {
    lines.push('');
    lines.push('Broken links (sample):');
    for (const x of h.broken_related.slice(0, 15)) {
      lines.push(`- \`${x.from}\` → \`${x.related}\``);
    }
  }
  if (h.missing_frontmatter.length) {
    lines.push('');
    lines.push('Missing front-matter (sample — adopt `templates/docs/FRONTMATTER.md`):');
    for (const p of h.missing_frontmatter.slice(0, 15)) {
      lines.push(`- \`${p}\``);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function defaultReadme(projectName) {
  return `# ${projectName} — docs index

> **Role:** project doc catalog · **Entry:** [\`AGENTS.md\`](../AGENTS.md) (\`CLAUDE.md\` → symlink)

## Doc map

\`\`\`mermaid
flowchart LR
  A[AGENTS.md] --> R[docs/README.md]
  R --> PS[PROJECT_STRUCTURES]
  R --> SD[SYSTEM_DESIGN]
  R --> PRE[pre-official]
  R --> POST[post-official]
\`\`\`

## Catalog

${CATALOG_START}
${CATALOG_END}

## Ownership rules (no duplication)

| Topic | Canonical doc | Never duplicate in |
|-------|---------------|-------------------|
| Directory layout & paths | \`PROJECT_STRUCTURES.md\` | \`SYSTEM_DESIGN.md\` |
| Service architecture | \`SYSTEM_DESIGN.md\` | \`PROJECT_STRUCTURES.md\` |
| Doc lifecycle stages | \`AGENTS.md\` / this catalog | scattered READMEs |
| Commands & env vars | \`AGENTS.md\` | any \`docs/*.md\` |

## Read order

1. [\`PROJECT_STRUCTURES.md\`](PROJECT_STRUCTURES.md) — where code lives
2. [\`SYSTEM_DESIGN.md\`](SYSTEM_DESIGN.md) — architecture overview
3. Task-specific doc (lifecycle → \`pre-official/\` / \`post-official/\`; API → \`docs/api/\`)
4. GitNexus for callers/callees/impact — never grep for call graphs

## Lifecycle folders

- **\`pre-official/\`** — concept / research / audits (not yet current truth)
- **\`specs/\`**, **\`plans/\`**, root architecture docs — OFFICIAL
- **\`post-official/\`** — completed plans + superseded legacy
- **\`decisions/\`** — ADRs with rationale

${HEALTH_START}
${HEALTH_END}
`;
}

function upsertMarked(text, start, end, inner) {
  if (text.includes(start) && text.includes(end)) {
    const re = new RegExp(
      `${escapeRe(start)}[\\s\\S]*?${escapeRe(end)}`,
      'm'
    );
    return text.replace(re, `${start}\n${inner}\n${end}`);
  }
  // append section
  return `${text.trimEnd()}\n\n## Catalog\n\n${start}\n${inner}\n${end}\n`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a front-matter-derived routing index grouped by lifecycle.
 * Caps at ~20 content lines (llms.txt convention) by prioritizing entry + architecture
 * then sampling remaining docs per lifecycle.
 */
function renderLlms(index, projectName) {
  const lines = [
    `# ${projectName}`,
    '',
    '> Agent routing index (generated). Full catalog: docs/README.md',
    '',
  ];

  const entry = index.docs.find((d) => d.path === 'AGENTS.md');
  lines.push('## Entry');
  if (entry) {
    const kw = entry.keywords.length ? ` — ${entry.keywords.slice(0, 4).join(', ')}` : '';
    lines.push(`- AGENTS.md — ${entry.title}${kw}`);
  } else {
    lines.push('- AGENTS.md — commands, env, GitNexus, workflow pointers');
  }
  lines.push('- docs/README.md — doc catalog, ownership, read order');
  lines.push('');

  const groups = [
    ['official', 'Official'],
    ['pre_official', 'Pre-official'],
    // post_official excluded from default routing — archive must not enter agent context
  ];

  // Prefer architecture / decisions first within official
  const rank = (d) => {
    if (d.path === 'AGENTS.md') return 0;
    if (d.type === 'architecture') return 1;
    if (d.type === 'decision') return 2;
    if (d.type === 'spec') return 3;
    if (d.type === 'plan') return 4;
    return 5;
  };

  const MAX_LINES = 22; // soft cap for substance
  for (const [key, label] of groups) {
    if (lines.length >= MAX_LINES) break;
    const docs = index.docs
      .filter((d) => d.lifecycle === key && d.path !== 'AGENTS.md' && !d.path.endsWith('/README.md'))
      .sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
    if (!docs.length) continue;
    lines.push(`## ${label}`);
    const budget = Math.max(2, Math.min(6, MAX_LINES - lines.length - 1));
    for (const d of docs.slice(0, budget)) {
      const kw = d.keywords.length ? ` (${d.keywords.slice(0, 3).join(', ')})` : '';
      lines.push(`- ${d.path} — ${d.title}${kw}`);
    }
    lines.push('');
  }

  lines.push('## Code structure');
  lines.push('Use GitNexus MCP — do not grep for call graphs.');
  lines.push('');
  return lines.join('\n');
}

/**
 * Write docs-index.json, docs/README.md catalog markers, and llms.txt.
 * @param {string} root
 * @returns {{ jsonPath: string, readmePath: string, llmsPath: string, artifacts: string[], index: object }}
 */
export function writeDocsIndex(root) {
  const projectName = basename(root);
  const index = buildIndex(root);
  const json = JSON.stringify(index, null, 2) + '\n';
  const catalog = renderCatalogRows(index);
  const health = renderHealth(index);
  const llms = renderLlms(index, projectName);

  const readmePath = join(root, README);
  let readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : defaultReadme(projectName);
  if (!existsSync(readmePath)) readme = defaultReadme(projectName);
  readme = upsertMarked(readme, CATALOG_START, CATALOG_END, catalog);
  if (readme.includes(HEALTH_START)) {
    readme = upsertMarked(readme, HEALTH_START, HEALTH_END, health);
  } else {
    readme = `${readme.trimEnd()}\n\n${HEALTH_START}\n${health}\n${HEALTH_END}\n`;
  }

  const jsonPath = join(root, JSON_OUT);
  const llmsPath = join(root, LLMS);

  mkdirSync(join(root, GENERATED_DIR), { recursive: true });
  writeFileSync(jsonPath, json, 'utf8');
  writeFileSync(readmePath, readme.endsWith('\n') ? readme : `${readme}\n`, 'utf8');
  writeFileSync(llmsPath, llms.endsWith('\n') ? llms : `${llms}\n`, 'utf8');

  return {
    jsonPath,
    readmePath,
    llmsPath,
    artifacts: [JSON_OUT, README, LLMS],
    index,
  };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const rootIdx = args.indexOf('--root');
  const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : process.cwd());

  if (check) {
    const index = buildIndex(root);
    const jsonPath = join(root, JSON_OUT);
    const llmsPath = join(root, LLMS);
    let fail = false;
    if (!existsSync(jsonPath)) fail = true;
    else {
      try {
        const prev = JSON.parse(readFileSync(jsonPath, 'utf8'));
        if (prev.counts?.docs !== index.counts.docs) fail = true;
      } catch {
        fail = true;
      }
    }
    if (!existsSync(llmsPath)) fail = true;
    if (fail) {
      console.error('docs-index out of date — run: node scripts/build-docs-index.mjs');
      process.exit(1);
    }
    console.log(
      `docs-index ok (${index.counts.docs} docs; broken_related=${index.health.broken_related.length}; oversize_alert=${index.health.oversize_alert.length})`
    );
    process.exit(0);
  }

  const result = writeDocsIndex(root);
  console.log(`Wrote ${JSON_OUT}, ${README}, ${LLMS}`);
  console.log(
    `  docs=${result.index.counts.docs} pre=${result.index.counts.pre_official} official=${result.index.counts.official} post=${result.index.counts.post_official}`
  );
  console.log(
    `  health: broken_related=${result.index.health.broken_related.length} oversize_alert=${result.index.health.oversize_alert.length} oversize_warn=${result.index.health.oversize_warn.length} missing_fm=${result.index.health.missing_frontmatter.length}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
