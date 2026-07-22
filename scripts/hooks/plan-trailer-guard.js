#!/usr/bin/env node
/**
 * PreToolUse Hook (Bash only): advisory `Plan:` trailer reminder before commits.
 *
 * The kit's plan↔commit traceability relies on every commit during plan work carrying
 * a `Plan: docs/plans/<file>.md#phase-N` trailer (docs/PLANS.md is rebuilt from these).
 * When a `git commit` runs during an ACTIVE plan but the message lacks a `Plan:` trailer,
 * this hook nudges — it never blocks (fail-OPEN, always exit 0).
 *
 * Conservative to avoid noise: only warns for plan-worthy commit types (feat/fix/refactor/
 * perf) so legitimate no-trailer commits — the PLANS.md-rebuild `chore:` and `docs:` — are
 * not nagged. "Active plan" = docs/PLANS.md has an Active-section row with status `active`.
 *
 * Opt-out: LUNA_PLAN_TRAILER_GUARD=off. Exit codes: always 0 (advisory).
 */

'use strict';

const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const MAX_STDIN = 1024 * 1024;
const PLAN_WORTHY_TYPE = /^(feat|fix|refactor|perf)\b/i;

// Reuse the dedupe-guard heuristic: is this a `git commit` (not "commit" in a message)?
function isGitCommit(command) {
  if (!command || typeof command !== 'string') return false;
  const unquoted = command
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'[^']*'/g, "''");
  return /\bgit\b(?:\s+-{1,2}[^\s]+(?:=\S+)?| +\S+=\S+)*\s+commit\b/.test(unquoted);
}

// True if any commit message in the command already carries a `Plan:` trailer.
function hasPlanTrailer(command) {
  return /(^|[\s"'\\n])Plan:\s*\S/i.test(String(command || ''));
}

// Extract the first `-m`/`--message` subject to classify the commit type. Returns ''
// when none is found (e.g. an editor commit) — then we don't warn (can't classify).
function firstCommitMessage(command) {
  const cmd = String(command || '');
  const m =
    cmd.match(/-m\s+"((?:[^"\\]|\\.)*)"/) ||
    cmd.match(/-m\s+'([^']*)'/) ||
    cmd.match(/--message[=\s]+"((?:[^"\\]|\\.)*)"/) ||
    cmd.match(/--message[=\s]+'([^']*)'/);
  return m ? m[1] : '';
}

function isPlanWorthy(subject) {
  return PLAN_WORTHY_TYPE.test(String(subject || '').trim());
}

// "Active plan" signal: docs/PLANS.md has a table row with status `active`.
function hasActivePlan(cwd) {
  try {
    const p = join(cwd, 'docs', 'PLANS.md');
    if (!existsSync(p)) return false;
    return /\|\s*active\s*\|/i.test(readFileSync(p, 'utf8'));
  } catch {
    return false;
  }
}

function extractCommand(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    const cmd = parsed.tool_input?.command;
    if (typeof cmd === 'string') return cmd;
    for (const key of ['command', 'cmd', 'input', 'shell', 'script']) {
      if (typeof parsed[key] === 'string') return parsed[key];
    }
  } catch {
    /* fall through */
  }
  return trimmed;
}

function extractCwd(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed.startsWith('{')) return process.cwd();
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.cwd === 'string') return parsed.cwd;
  } catch {
    /* fall through */
  }
  return process.cwd();
}

function run(rawInput) {
  if ((process.env.LUNA_PLAN_TRAILER_GUARD || 'on').trim().toLowerCase() === 'off') {
    return { exitCode: 0 };
  }
  const command = extractCommand(rawInput);
  if (!isGitCommit(command)) return { exitCode: 0 };
  if (hasPlanTrailer(command)) return { exitCode: 0 };

  const subject = firstCommitMessage(command);
  if (!isPlanWorthy(subject)) return { exitCode: 0 };

  const cwd = extractCwd(rawInput);
  if (!hasActivePlan(cwd)) return { exitCode: 0 };

  return {
    exitCode: 0,
    systemMessage:
      'Plan-trailer reminder: an active plan exists in docs/PLANS.md but this commit ' +
      'lacks a `Plan: docs/plans/<file>.md#phase-N` trailer. Add one so plan↔commit ' +
      'traceability stays intact (the PLANS.md rebuild is derived from these trailers). ' +
      'Set LUNA_PLAN_TRAILER_GUARD=off to silence.',
  };
}

module.exports = {
  run,
  isGitCommit,
  hasPlanTrailer,
  firstCommitMessage,
  isPlanWorthy,
  hasActivePlan,
};

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    const r = run(raw);
    if (r.systemMessage) {
      process.stdout.write(JSON.stringify({ systemMessage: r.systemMessage }) + '\n');
    }
    process.exit(0);
  });
}
