#!/usr/bin/env node
/**
 * PostToolUse (Bash) helper: async GitNexus reindex for git submodules after
 * parent pointer bumps or commits inside a submodule checkout.
 *
 * Invoked from hooks/gitnexus-post-commit (background). Fail-open.
 * Opt-out: LUNA_GITNEXUS_AUTOSYNC=off (same as parent hooks).
 */

'use strict';

const { spawn } = require('child_process');
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');
const {
  findProjectRoot,
  parseGitmodules,
  indexStatus,
  submodulePointersChangedInHead,
  resolveAnalyzeCommand,
} = require('../lib/gitnexus-submodules');

const MAX_STDIN = 1024 * 1024;

function extractCommand(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed.startsWith('{')) return { command: trimmed, cwd: process.cwd(), exitCode: '' };
  try {
    const parsed = JSON.parse(trimmed);
    const ti = parsed.tool_input || {};
    const tr = parsed.tool_response || {};
    let exitCode = '';
    for (const k of ['exit_code', 'exitCode', 'returncode', 'status']) {
      if (k in tr) {
        exitCode = String(tr[k]);
        break;
      }
    }
    return {
      command: typeof ti.command === 'string' ? ti.command : '',
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : process.cwd(),
      exitCode,
    };
  } catch {
    return { command: '', cwd: process.cwd(), exitCode: '' };
  }
}

function isGitCommit(command) {
  if (!command) return false;
  const unquoted = command
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'[^']*'/g, "''");
  return /\bgit\b(?:\s+-{1,2}[^\s]+(?:=\S+)?| +\S+=\S+)*\s+commit\b/.test(unquoted);
}

function gitTopLevel(dir) {
  try {
    const { execFileSync } = require('child_process');
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
    }).trim();
  } catch {
    return '';
  }
}

function spawnAnalyze(repoPath) {
  if (!existsSync(repoPath)) return;
  const [bin, ...args] = resolveAnalyzeCommand();
  const logDir = join(repoPath, '.gitnexus');
  mkdirSync(logDir, { recursive: true });
  const log = join(logDir, '.analyze.last.log');
  const child = spawn(bin, args, {
    cwd: repoPath,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout?.on('data', d => { out += d; });
  child.stderr?.on('data', d => { out += d; });
  child.on('close', () => {
    try { writeFileSync(log, out); } catch { /* ignore */ }
  });
  child.unref();
}

function collectTargets(projectRoot, cwd) {
  const targets = new Set();
  const submodules = parseGitmodules(projectRoot);

  for (const sm of submodulePointersChangedInHead(projectRoot)) {
    targets.add(join(projectRoot, sm.path));
  }

  const top = gitTopLevel(cwd);
  if (top) {
    for (const sm of submodules) {
      const smAbs = join(projectRoot, sm.path);
      if (top === smAbs || top.startsWith(smAbs + '/')) {
        targets.add(smAbs);
      }
    }
  }

  return [...targets];
}

function run(rawInput, projectDir) {
  if ((process.env.LUNA_GITNEXUS_AUTOSYNC || 'on').trim().toLowerCase() === 'off') {
    return { exitCode: 0 };
  }

  const { command, cwd, exitCode } = extractCommand(rawInput);
  if (!isGitCommit(command)) return { exitCode: 0 };
  if (exitCode && exitCode !== '0') return { exitCode: 0 };

  const projectRoot = findProjectRoot(projectDir || cwd);
  if (!projectRoot) return { exitCode: 0 };

  const targets = collectTargets(projectRoot, cwd);
  for (const t of targets) {
    spawnAnalyze(t);
  }

  return { exitCode: 0, spawned: targets };
}

module.exports = { run, isGitCommit, collectTargets };

if (require.main === module) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    run(raw, projectDir);
    process.exit(0);
  });
}
