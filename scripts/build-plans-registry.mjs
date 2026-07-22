#!/usr/bin/env node
/**
 * build-plans-registry.mjs — regenerate docs/PLANS.md from git history.
 *
 * Derives the plan↔commit map from the `Plan:` commit trailer (pain #7), so it
 * can't drift: every commit during plan work carries `Plan: docs/plans/<f>.md#phase-N`.
 *
 *   git log --grep '^Plan:' → group by plan file → one row per plan with the
 *   phases seen, the most-recent commit, and a status.
 *
 * Human-maintained columns (Spec, Owner, Resume hint) are PRESERVED from the
 * existing table when a plan row already exists — git can't know them.
 *
 * Lifecycle (§7 of promote/demote contract): trailer paths are immutable logical
 * IDs. If the file moved to docs/post-official/completed-plans/<basename>, the
 * row is listed under Completed with a resolvable current path.
 *
 * Usage: node scripts/build-plans-registry.mjs   (run from repo root)
 *        --check   exit 1 if PLANS.md would change (CI guard), don't write.
 *        --root <dir>  operate on a different git root (tests)
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseFrontmatter } from './lib/frontmatter.mjs';

export const PLANS_FILE = 'docs/PLANS.md';
export const COMPLETED_HEADING = '## Completed';
const TRAILER_RE = /^Plan:\s*(\S+?)(?:#(\S+))?\s*$/im;
const COMPLETED_DIR = 'docs/post-official/completed-plans';

function git(cwd, args) {
  try {
    return execSync(`git ${args}`, {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/**
 * Resolve where a logical plan id currently lives on disk.
 * @param {string} root
 * @param {string} logicalId — trailer path, e.g. docs/plans/foo.md
 * @returns {string|null}
 */
export function resolvePlanCurrentPath(root, logicalId) {
  const id = String(logicalId || '').replace(/\\/g, '/');
  if (!id) return null;
  if (existsSync(join(root, id))) return id;
  const archived = `${COMPLETED_DIR}/${basename(id)}`;
  if (existsSync(join(root, archived))) return archived;
  return null;
}

// One record per commit that carries a Plan: trailer.
export function collectCommits(root = process.cwd()) {
  const SEP = '';
  const REC = '';
  const raw = git(root, `log --grep '^Plan:' --pretty=format:'%h${SEP}%cs${SEP}%s${SEP}%b${REC}'`);
  if (!raw.trim()) return [];
  const out = [];
  for (const rec of raw.split(REC)) {
    const r = rec.trim();
    if (!r) continue;
    const [short, date, subject, ...bodyParts] = r.split(SEP);
    const body = bodyParts.join(SEP);
    const m = `${subject}\n${body}`.match(TRAILER_RE);
    if (!m) continue;
    out.push({ short, date, subject: (subject || '').trim(), plan: m[1], phase: m[2] || '' });
  }
  return out;
}

// Preserve human columns from the existing PLANS.md (keyed by plan path / logical id).
export function existingHumanCols(root = process.cwd()) {
  const map = new Map();
  const plansPath = join(root, PLANS_FILE);
  if (!existsSync(plansPath)) return map;
  const text = readFileSync(plansPath, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || line.includes('---') || /\|\s*Plan\s*\|/i.test(line)) continue;
    const cols = line.split('|').map((c) => c.trim());
    // | Spec | Plan | Phase | Owner | Last commit | Status | Resume hint |
    // Completed rows may have an extra Current path column — still key on Plan (cols[2])
    if (cols.length < 9) continue;
    const plan = cols[2];
    if (!plan || plan === '—') continue;
    // Active: 7 data cols; Completed: 8 data cols (includes Current path)
    const completed = cols.length >= 11;
    if (completed) {
      map.set(plan, {
        spec: cols[1] || '—',
        owner: cols[5] || '—',
        resume: cols[8] || '—',
      });
    } else {
      map.set(plan, {
        spec: cols[1] || '—',
        owner: cols[4] || '—',
        resume: cols[7] || '—',
      });
    }
  }
  return map;
}

function groupByPlan(commits) {
  const byPlan = new Map();
  for (const c of commits) {
    if (!byPlan.has(c.plan)) byPlan.set(c.plan, { phases: new Set(), commits: [] });
    const g = byPlan.get(c.plan);
    if (c.phase) g.phases.add(c.phase);
    g.commits.push(c);
  }
  return byPlan;
}

function activeHeader() {
  return (
    '| Spec | Plan | Phase | Owner | Last commit | Status | Resume hint |\n' +
    '|------|------|-------|-------|-------------|--------|-------------|'
  );
}

function completedHeader() {
  return (
    '| Spec | Plan | Current path | Phase | Owner | Last commit | Status | Resume hint |\n' +
    '|------|------|--------------|-------|-------|-------------|--------|-------------|'
  );
}

function rowActive(plan, g, h) {
  const phases = [...g.phases].sort().join(', ') || '—';
  const latest = g.commits[0];
  const lastCommit = `\`${latest.short}\` ${latest.date}`;
  const status = /\bdone\b|complete|finish/i.test(latest.subject) ? 'done' : 'active';
  return `| ${h.spec} | ${plan} | ${phases} | ${h.owner} | ${lastCommit} | ${status} | ${h.resume} |`;
}

function rowCompleted(root, plan, currentPath, g, h) {
  const phases = [...g.phases].sort().join(', ') || '—';
  const latest = g.commits[0];
  const lastCommit = `\`${latest.short}\` ${latest.date}`;
  let status = currentPath ? 'done' : 'dangling';
  let currentCell = currentPath || '—';
  // Distinguish a plan that was superseded (points to a successor) from one merely
  // completed. Read-only front-matter of the archived file; falls back to 'done'.
  if (currentPath) {
    try {
      const { data } = parseFrontmatter(readFileSync(join(root, currentPath), 'utf8'));
      if (data && (data.status === 'superseded' || data.superseded_by)) {
        status = 'superseded';
        if (data.superseded_by) currentCell = `${currentPath} → ${String(data.superseded_by)}`;
      }
    } catch {
      /* unreadable — keep 'done' */
    }
  }
  return `| ${h.spec} | ${plan} | ${currentCell} | ${phases} | ${h.owner} | ${lastCommit} | ${status} | ${h.resume} |`;
}

/**
 * @param {string} root
 * @param {Array<{ short: string, date: string, subject: string, plan: string, phase: string }>} commits
 * @param {Map<string, { spec: string, owner: string, resume: string }>} human
 */
export function buildRegistryMarkdown(root, commits, human) {
  const byPlan = groupByPlan(commits);
  const activeRows = [];
  const completedRows = [];

  if (byPlan.size === 0) {
    return (
      '# Plan registry\n\n' +
      "> Auto-built from `git log --grep '^Plan:'` via `scripts/build-plans-registry.mjs`.\n" +
      '> **Owner** = which tool (`claude`/`cursor`) currently holds the work — the cross-tool handoff\n' +
      '> column. **Spec** links back to the design in `docs/specs/`. Owner/Spec/Resume are human-kept;\n' +
      '> Phase/Last commit/Status are derived from git and overwritten on each run.\n' +
      '> Trailer paths are logical plan IDs; archived plans resolve under `post-official/completed-plans/`.\n\n' +
      activeHeader() +
      '\n| — | — | — | — | — | — | Run `doc-init` then `dev-plan` to start tracked plan work |\n'
    );
  }

  for (const [plan, g] of byPlan) {
    const h = human.get(plan) || { spec: '—', owner: '—', resume: '—' };
    const current = resolvePlanCurrentPath(root, plan);
    if (current && current.startsWith(COMPLETED_DIR + '/')) {
      completedRows.push(rowCompleted(root, plan, current, g, h));
    } else if (!current) {
      // dangling — show in Active with status dangling so it's visible
      const phases = [...g.phases].sort().join(', ') || '—';
      const latest = g.commits[0];
      const lastCommit = `\`${latest.short}\` ${latest.date}`;
      activeRows.push(
        `| ${h.spec} | ${plan} | ${phases} | ${h.owner} | ${lastCommit} | dangling | ${h.resume} |`,
      );
    } else {
      activeRows.push(rowActive(plan, g, h));
    }
  }

  let body =
    '# Plan registry\n\n' +
    "> Auto-built from `git log --grep '^Plan:'` via `scripts/build-plans-registry.mjs`.\n" +
    '> **Owner** = which tool (`claude`/`cursor`) currently holds the work — the cross-tool handoff\n' +
    '> column. **Spec** links back to the design in `docs/specs/`. Owner/Spec/Resume are human-kept;\n' +
    '> Phase/Last commit/Status are derived from git and overwritten on each run.\n' +
    '> Trailer paths are logical plan IDs; archived plans resolve under `post-official/completed-plans/`.\n\n' +
    activeHeader() +
    '\n' +
    (activeRows.length
      ? activeRows.join('\n')
      : '| — | — | — | — | — | — | — |');

  if (completedRows.length) {
    body +=
      '\n\n' +
      COMPLETED_HEADING +
      '\n\n' +
      '> Plans whose files live under `docs/post-official/completed-plans/`. **Plan** column stays the\n' +
      '> logical trailer id; **Current path** is the on-disk location.\n\n' +
      completedHeader() +
      '\n' +
      completedRows.join('\n');
  }

  return body + '\n';
}

export function renderAt(root = process.cwd()) {
  const commits = collectCommits(root);
  return buildRegistryMarkdown(root, commits, existingHumanCols(root));
}

function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--root');
  const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
  const next = renderAt(root);
  const plansPath = join(root, PLANS_FILE);
  const current = existsSync(plansPath) ? readFileSync(plansPath, 'utf8') : '';

  if (args.includes('--check')) {
    if (next !== current) {
      console.error(`${PLANS_FILE} is out of date — run: node scripts/build-plans-registry.mjs`);
      process.exit(1);
    }
    console.log(`${PLANS_FILE} is up to date.`);
    process.exit(0);
  }

  writeFileSync(plansPath, next, 'utf8');
  const commits = collectCommits(root);
  console.log(`Wrote ${PLANS_FILE} (${commits.length} plan-tagged commits).`);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('build-plans-registry.mjs') ||
    process.argv[1].endsWith('build-plans-registry.js'));

if (isMain) {
  main();
}
