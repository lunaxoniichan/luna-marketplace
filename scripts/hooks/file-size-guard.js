#!/usr/bin/env node
/**
 * PostToolUse Hook: advisory file-size guard.
 *
 * After any Write or Edit, checks the edited file's line count. If it
 * exceeds WARN (300) or ALERT (500) thresholds, emits an advisory suggesting
 * the appropriate skill (doc-simplify for .md, dev-refactor for code).
 *
 * Purely advisory — never blocks (fail-OPEN, always exit 0).
 *
 * Thresholds (token-cost framing):
 *   ≤300 lines  ≈ ≤1,200 tokens  → healthy
 *   301–500     ≈ 1,200–2,000    → WARN: approaching multiple concerns
 *   >500        ≈ >2,000         → ALERT: act now
 *
 * Opt-out: LUNA_FILE_SIZE_GUARD=off
 * Custom thresholds: LUNA_FILE_SIZE_WARN_LINES=300  LUNA_FILE_SIZE_ALERT_LINES=500
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WARN_DEFAULT = 300;
const ALERT_DEFAULT = 500;

const DOC_RE = /\.md$/i;
const CODE_RE = /\.(py|ts|tsx|js|mjs|cjs|jsx|go|rs|java|rb|php)$/i;

// Paths that should never trigger the guard
const EXCLUDE_RE = new RegExp(
  [
    'node_modules',
    '\\.venv',
    '/venv/',
    '__pycache__',
    '/migrations?/',
    '_archive',
    '\\.min\\.',
    '\\.next',
    '/dist/',
    '/build/',
    '/vendor/',
    '\\.gitnexus',
    '\\.jscpd',
    // test fixtures: anything with test/spec/fixture in path
    '/(tests?|spec|__tests__|fixtures?)/',
  ]
    .map(s => `(${s})`)
    .join('|'),
  'i'
);

// Skill SKILL.md files have their own 250-line limit; skip guard for them
const SKILL_RE = /skills\/[^/]+\/SKILL\.md$/i;

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function classify(filePath) {
  if (DOC_RE.test(filePath)) return 'doc';
  if (CODE_RE.test(filePath)) return 'code';
  return null;
}

function buildMessage(filePath, lines, level, kind) {
  const threshold = level === 'ALERT' ? 'alert' : 'warn';
  const thresholdVal = level === 'ALERT'
    ? parseInt(process.env.LUNA_FILE_SIZE_ALERT_LINES || ALERT_DEFAULT, 10)
    : parseInt(process.env.LUNA_FILE_SIZE_WARN_LINES || WARN_DEFAULT, 10);
  const icon = level === 'ALERT' ? '🔴' : '🟡';
  const rel = filePath.replace(process.cwd() + '/', '');

  if (kind === 'doc') {
    return (
      `${icon} File-size ${level}: \`${rel}\` is ${lines} lines ` +
      `(${threshold}: ${thresholdVal}). ` +
      `Consider running \`doc-simplify\` — use [ref] tags + ## File index to split concerns into focused docs.`
    );
  }
  return (
    `${icon} File-size ${level}: \`${rel}\` is ${lines} lines ` +
    `(${threshold}: ${thresholdVal}). ` +
    `Consider running \`dev-refactor\` — run GitNexus impact analysis first to find safe extraction boundaries.`
  );
}

// Pure, testable core: given a file path and its line count, produce a message or null.
function check(filePath, lines, opts = {}) {
  const warnLines = opts.warnLines ?? parseInt(process.env.LUNA_FILE_SIZE_WARN_LINES || WARN_DEFAULT, 10);
  const alertLines = opts.alertLines ?? parseInt(process.env.LUNA_FILE_SIZE_ALERT_LINES || ALERT_DEFAULT, 10);

  if (!filePath) return null;
  if (EXCLUDE_RE.test(filePath)) return null;
  if (SKILL_RE.test(filePath)) return null;

  const kind = classify(filePath);
  if (!kind) return null;
  if (lines <= warnLines) return null;

  const level = lines > alertLines ? 'ALERT' : 'WARN';
  return buildMessage(filePath, lines, level, kind);
}

function extractFilePath(input) {
  try {
    const parsed = JSON.parse(input || '{}');
    // PostToolUse payload: tool_response.file_path or tool_input.file_path
    return (
      parsed?.tool_response?.file_path ||
      parsed?.tool_input?.file_path ||
      parsed?.file_path ||
      null
    );
  } catch {
    return null;
  }
}

function run(rawInput) {
  if ((process.env.LUNA_FILE_SIZE_GUARD || 'on').trim().toLowerCase() === 'off') {
    return { exitCode: 0 };
  }

  const filePath = extractFilePath(rawInput);
  if (!filePath) return { exitCode: 0 };

  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const lines = countLines(absPath);
  const msg = check(absPath, lines);

  return msg ? { exitCode: 0, systemMessage: msg } : { exitCode: 0 };
}

module.exports = { run, check };

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    const r = run(raw);
    if (r.systemMessage) {
      process.stdout.write(JSON.stringify({ systemMessage: r.systemMessage }) + '\n');
    }
    process.exit(0);
  });
}
