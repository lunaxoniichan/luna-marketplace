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
 * Usage: node scripts/build-plans-registry.mjs   (run from repo root)
 *        --check   exit 1 if PLANS.md would change (CI guard), don't write.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PLANS_FILE = 'docs/PLANS.md';
const TRAILER_RE = /^Plan:\s*(\S+?)(?:#(\S+))?\s*$/im;

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

// One record per commit that carries a Plan: trailer.
function collectCommits() {
  // %H hash, %h short, %cs commit date, %s subject, %b body — record-separated.
  const SEP = '';
  const REC = '';
  const raw = git(`log --grep '^Plan:' --pretty=format:'%h${SEP}%cs${SEP}%s${SEP}%b${REC}'`);
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

// Preserve human columns from the existing PLANS.md (keyed by plan path).
function existingHumanCols() {
  const map = new Map();
  if (!existsSync(PLANS_FILE)) return map;
  const text = readFileSync(PLANS_FILE, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || line.includes('---') || /\|\s*Plan\s*\|/i.test(line)) continue;
    const cols = line.split('|').map(c => c.trim());
    // | Spec | Plan | Phase | Owner | Last commit | Status | Resume hint |
    if (cols.length < 9) continue;
    const plan = cols[2];
    if (!plan || plan === '—') continue;
    map.set(plan, { spec: cols[1] || '—', owner: cols[4] || '—', resume: cols[7] || '—' });
  }
  return map;
}

function buildTable(commits, human) {
  const byPlan = new Map();
  for (const c of commits) {
    if (!byPlan.has(c.plan)) byPlan.set(c.plan, { phases: new Set(), commits: [] });
    const g = byPlan.get(c.plan);
    if (c.phase) g.phases.add(c.phase);
    g.commits.push(c);
  }

  const header =
    '| Spec | Plan | Phase | Owner | Last commit | Status | Resume hint |\n' +
    '|------|------|-------|-------|-------------|--------|-------------|';

  if (byPlan.size === 0) {
    return header + '\n| — | — | — | — | — | — | Run `doc-init` then `dev-plan` to start tracked plan work |';
  }

  const rows = [];
  for (const [plan, g] of byPlan) {
    const h = human.get(plan) || { spec: '—', owner: '—', resume: '—' };
    const phases = [...g.phases].sort().join(', ') || '—';
    const latest = g.commits[0]; // git log is newest-first
    const lastCommit = `\`${latest.short}\` ${latest.date}`;
    const status = /\bdone\b|complete|finish/i.test(latest.subject) ? 'done' : 'active';
    rows.push(`| ${h.spec} | ${plan} | ${phases} | ${h.owner} | ${lastCommit} | ${status} | ${h.resume} |`);
  }
  return header + '\n' + rows.join('\n');
}

function render(table) {
  return (
    '# Plan registry\n\n' +
    "> Auto-built from `git log --grep '^Plan:'` via `scripts/build-plans-registry.mjs`.\n" +
    '> **Owner** = which tool (`claude`/`cursor`) currently holds the work — the cross-tool handoff\n' +
    '> column. **Spec** links back to the design in `docs/specs/`. Owner/Spec/Resume are human-kept;\n' +
    '> Phase/Last commit/Status are derived from git and overwritten on each run.\n\n' +
    table + '\n'
  );
}

const commits = collectCommits();
const table = buildTable(commits, existingHumanCols());
const next = render(table);
const current = existsSync(PLANS_FILE) ? readFileSync(PLANS_FILE, 'utf8') : '';

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error(`${PLANS_FILE} is out of date — run: node scripts/build-plans-registry.mjs`);
    process.exit(1);
  }
  console.log(`${PLANS_FILE} is up to date.`);
  process.exit(0);
}

writeFileSync(PLANS_FILE, next, 'utf8');
console.log(`Wrote ${PLANS_FILE} (${commits.length} plan-tagged commits).`);
