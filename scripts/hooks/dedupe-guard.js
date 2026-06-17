#!/usr/bin/env node
/**
 * PreToolUse Hook (Bash only): advisory duplicate-code warning before commits.
 *
 * Coding agents bias toward writing NEW code over reusing existing code, so
 * near-duplicate functions accumulate. When a `git commit` is about to run, this
 * hook runs jscpd (deterministic copy/paste detector, 150+ languages) over the
 * STAGED source files and warns if clones are present. It complements the
 * proactive GitNexus query (codebase-awareness rule) with a reactive floor.
 *
 * Purely advisory — never blocks (fail-OPEN, always exit 0). It only nudges; the
 * deep, cross-repo cleanup lives in the `dev-refactor` skill (or `refactor-cleaner` agent);
 * diff-scoped passes use `review-simplify`.
 *
 * Scope: staged source files only (fast, bounded). Detects copy-paste within and
 * across the files this commit touches — not a whole-repo scan.
 *
 * Resolves jscpd from `node_modules/.bin` (walk up from cwd) then `npx jscpd`.
 * If unavailable, logs one line to stderr and skips (fail-open).
 * Opt-out: LUNA_DEDUPE_GUARD=off.
 *
 * Exit codes: always 0 (advisory).
 */

'use strict';

const { execFileSync } = require('child_process');
const { mkdtempSync, readFileSync, rmSync, existsSync } = require('fs');
const { tmpdir } = require('os');
const { join, dirname } = require('path');

const MAX_STDIN = 1024 * 1024;
const SOURCE_RE = /\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|rb|php|swift|kt|cs|cpp|cc|c|h|hpp|scala|m)$/i;
const JSCPD_TIMEOUT_MS = 12000;

// Pure, testable core: is this Bash command a `git commit`? Matches `git commit`
// as a subcommand while ignoring the word "commit" inside a -m message or a
// different subcommand (e.g. `git push origin commit-branch`). Advisory hook, so
// a missed/extra match is harmless — keep the heuristic simple and conservative.
function isGitCommit(command) {
  if (!command || typeof command !== 'string') return false;
  // Strip quoted strings so a commit message mentioning "commit" doesn't match.
  const unquoted = command
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'[^']*'/g, "''");
  // git, then only flags/flag-args, then the `commit` subcommand.
  return /\bgit\b(?:\s+-{1,2}[^\s]+(?:=\S+)?| +\S+=\S+)*\s+commit\b/.test(unquoted);
}

// Pure, testable core: turn a parsed jscpd JSON report into a warning string
// (or null when there is nothing to warn about).
function summarizeReport(report) {
  if (!report || typeof report !== 'object') return null;
  const dups = Array.isArray(report.duplicates) ? report.duplicates : [];
  const total = report.statistics?.total?.clones ?? dups.length;
  if (!total || total < 1) return null;

  const top = dups.slice(0, 5).map(d => {
    const aName = d.firstFile?.name ?? '?';
    const aStart = d.firstFile?.start ?? '?';
    const bName = d.secondFile?.name ?? '?';
    const bStart = d.secondFile?.start ?? '?';
    const lines = d.lines ?? '?';
    return `  • ${aName}:${aStart} ↔ ${bName}:${bStart} (${lines} lines)`;
  });

  return (
    `Dedupe-guard: jscpd found ${total} duplicate block(s) in the staged changes. ` +
    `Consider consolidating before committing (run review-simplify for a deeper jscpd + ` +
    `GitNexus semantic pass):\n${top.join('\n')}\n` +
    `Set LUNA_DEDUPE_GUARD=off to silence.`
  );
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

function stagedSourceFiles(cwd) {
  try {
    const out = execFileSync(
      'git',
      ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }
    );
    return out.split('\n').map(s => s.trim()).filter(f => f && SOURCE_RE.test(f));
  } catch {
    return [];
  }
}

// Walk up from cwd looking for node_modules/.bin/jscpd (kit or app repo).
function resolveJscpdBin(startDir) {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    const local = join(dir, 'node_modules', '.bin', 'jscpd');
    if (existsSync(local)) return local;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Run jscpd over the given files; return the parsed report or null on any failure.
function runJscpd(files, cwd) {
  const jscpdBin = resolveJscpdBin(cwd);
  const jscpdArgs = [...files, '--silent', '--reporters', 'json', '--output'];
  let outDir;
  try {
    outDir = mkdtempSync(join(tmpdir(), 'luna-dedupe-'));
    jscpdArgs.push(outDir);
    if (jscpdBin) {
      execFileSync(jscpdBin, jscpdArgs, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: JSCPD_TIMEOUT_MS,
      });
    } else {
      execFileSync('npx', ['jscpd', ...jscpdArgs], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: JSCPD_TIMEOUT_MS,
      });
    }
  } catch {
    // jscpd exits non-zero when a threshold trips — the report is still written,
    // so fall through to read it. Genuine failures (no npx/jscpd) leave no report.
    if (!jscpdBin && !existsSync(join(outDir || '', 'jscpd-report.json'))) {
      process.stderr.write('dedupe-guard: jscpd not found — run npm install in the kit repo or install jscpd globally\n');
    }
  }
  try {
    const reportPath = join(outDir, 'jscpd-report.json');
    if (!existsSync(reportPath)) return null;
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  } finally {
    if (outDir) {
      try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

function run(rawInput) {
  if ((process.env.LUNA_DEDUPE_GUARD || 'on').trim().toLowerCase() === 'off') {
    return { exitCode: 0 };
  }
  const command = extractCommand(rawInput);
  if (!isGitCommit(command)) return { exitCode: 0 };

  const cwd = extractCwd(rawInput);
  const files = stagedSourceFiles(cwd);
  if (files.length === 0) return { exitCode: 0 };

  const report = runJscpd(files, cwd);
  const message = summarizeReport(report);
  return message ? { exitCode: 0, systemMessage: message } : { exitCode: 0 };
}

module.exports = { run, isGitCommit, summarizeReport, resolveJscpdBin };

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
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
