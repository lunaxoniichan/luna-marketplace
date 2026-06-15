#!/usr/bin/env node
/**
 * Stop Hook: advisory doc-sync reminder.
 *
 * When the session changed source code but left docs/ untouched, suggest
 * running doc-update-project / doc-update-agent. Purely advisory — never
 * blocks (fail-OPEN, always exit 0). Adapted from flynance post_tool_use_lints.
 *
 * Looks at the working tree + staged changes (git) to decide. If git is
 * unavailable or there is nothing notable, it stays silent.
 *
 * Opt-out: LUNA_DOC_SYNC_REMINDER=off.
 */

'use strict';

const { execSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;

const SOURCE_RE = /\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|rb|php|sql|sh)$/i;
const DOC_RE = /(^|\/)(docs\/|README|AGENTS\.md|CLAUDE\.md|.*\.md$)/i;

// Pure, testable core: given the list of changed paths, decide whether to remind.
function shouldRemind(changedFiles) {
  const files = (changedFiles || []).filter(Boolean);
  const sourceChanged = files.some(f => SOURCE_RE.test(f));
  const docsChanged = files.some(f => DOC_RE.test(f) || f.startsWith('docs/'));
  return sourceChanged && !docsChanged;
}

function changedFilesFromGit(cwd) {
  try {
    const out = execSync('git status --porcelain', {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
    });
    return out
      .split('\n')
      .map(l => l.slice(3).trim()) // strip the 2-char status + space
      .filter(Boolean);
  } catch {
    return [];
  }
}

const MESSAGE =
  'Doc-sync reminder: source files changed this session but docs/ is untouched. ' +
  'Consider doc-update-project (architecture/structure/schema/API) and/or ' +
  'doc-update-agent (PLANS/TODO + lessons) before wrapping up. ' +
  'Set LUNA_DOC_SYNC_REMINDER=off to silence.';

function run(rawInput) {
  if ((process.env.LUNA_DOC_SYNC_REMINDER || 'on').trim().toLowerCase() === 'off') {
    return { exitCode: 0 };
  }
  let cwd = process.cwd();
  try {
    const trimmed = (rawInput || '').trim();
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.cwd === 'string') cwd = parsed.cwd;
    }
  } catch {
    /* fall through with default cwd */
  }
  const remind = shouldRemind(changedFilesFromGit(cwd));
  return remind ? { exitCode: 0, systemMessage: MESSAGE } : { exitCode: 0 };
}

module.exports = { run, shouldRemind };

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    const r = run(raw);
    if (r.systemMessage) {
      // Stop hook: emit advisory context without blocking (no "decision" field).
      process.stdout.write(JSON.stringify({ systemMessage: r.systemMessage }) + '\n');
    }
    process.exit(0);
  });
}
