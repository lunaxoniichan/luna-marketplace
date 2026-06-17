#!/usr/bin/env node
/**
 * PreToolUse (Read|Write|Edit): advisory when touching files inside a git submodule
 * whose GitNexus index is stale or missing.
 *
 * Fail-open (exit 0). Opt-out: LUNA_GITNEXUS_SUBMODULE_ADVISORY=off.
 */

'use strict';

const { existsSync } = require('fs');
const { join } = require('path');
const {
  findProjectRoot,
  submoduleForPath,
  indexStatus,
} = require('../lib/gitnexus-submodules');

const MAX_STDIN = 1024 * 1024;

function extractPath(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed.startsWith('{')) return '';
  try {
    const parsed = JSON.parse(trimmed);
    const ti = parsed.tool_input || {};
    if (typeof ti.file_path === 'string') return ti.file_path;
    if (typeof ti.path === 'string') return ti.path;
  } catch {
    /* fall through */
  }
  return '';
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
  if ((process.env.LUNA_GITNEXUS_SUBMODULE_ADVISORY || 'on').trim().toLowerCase() === 'off') {
    return { exitCode: 0 };
  }

  const filePath = extractPath(rawInput);
  if (!filePath) return { exitCode: 0 };

  const cwd = extractCwd(rawInput);
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) return { exitCode: 0 };

  const sm = submoduleForPath(projectRoot, filePath);
  if (!sm || !existsSync(sm.absPath)) return { exitCode: 0 };

  const status = indexStatus(sm.absPath);
  if (status === 'fresh') return { exitCode: 0 };

  const cmd = `npx gitnexus analyze  # in ${sm.path}/`;
  const reason =
    status === 'unindexed'
      ? `Submodule \`${sm.path}\` has no GitNexus index — run \`${cmd}\` before refactor edits for accurate impact/rename.`
      : `Submodule \`${sm.path}\` GitNexus index is stale — run \`${cmd}\` (or commit triggers async reindex via gitnexus-post-commit).`;

  return {
    exitCode: 0,
    systemMessage:
      `GitNexus submodule advisory: ${reason} Use \`group_query\` for cross-module dupes. ` +
      `See dev-refactor § Monorepo + submodules.`,
  };
}

module.exports = { run, extractPath };

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
