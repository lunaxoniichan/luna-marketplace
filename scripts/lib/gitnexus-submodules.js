'use strict';

const { existsSync, readFileSync } = require('fs');
const { execFileSync } = require('child_process');
const { join, resolve, relative, sep } = require('path');

const GITMODULES = '.gitmodules';
const META = join('.gitnexus', 'meta.json');

/** @returns {{ name: string, path: string }[]} */
function parseGitmodules(projectRoot) {
  const file = join(projectRoot, GITMODULES);
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  const out = [];
  let name = '';
  let path = '';
  for (const line of text.split('\n')) {
    const nm = line.match(/^\s*\[submodule\s+"([^"]+)"\]/);
    if (nm) {
      if (name && path) out.push({ name, path });
      name = nm[1];
      path = '';
      continue;
    }
    const pm = line.match(/^\s*path\s*=\s*(.+)\s*$/);
    if (pm) path = pm[1].trim();
  }
  if (name && path) out.push({ name, path });
  return out;
}

function gitHead(repoPath) {
  try {
    return execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
    }).trim();
  } catch {
    return '';
  }
}

function indexedLastCommit(repoPath) {
  const metaPath = join(repoPath, META);
  if (!existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    return meta.lastCommit || meta.last_commit || '';
  } catch {
    return null;
  }
}

/** @returns {'fresh'|'stale'|'unindexed'} */
function indexStatus(repoPath) {
  if (!existsSync(join(repoPath, META))) return 'unindexed';
  const head = gitHead(repoPath);
  const last = indexedLastCommit(repoPath);
  if (!head || last === null) return 'unindexed';
  return last === head ? 'fresh' : 'stale';
}

function findProjectRoot(startDir) {
  let dir = resolve(startDir);
  for (let i = 0; i < 30; i++) {
    if (existsSync(join(dir, GITMODULES))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Which submodule (if any) contains this file path relative to project root. */
function submoduleForPath(projectRoot, filePath) {
  if (!filePath) return null;
  const abs = resolve(projectRoot, filePath);
  const rel = relative(projectRoot, abs);
  if (rel.startsWith('..')) return null;
  const parts = rel.split(sep);
  const submodules = parseGitmodules(projectRoot);
  for (const sm of submodules) {
    const smParts = sm.path.split(/[/\\]/);
    if (parts.length >= smParts.length && smParts.every((p, i) => parts[i] === p)) {
      return { ...sm, absPath: join(projectRoot, sm.path) };
    }
  }
  return null;
}

/** Submodule gitlink paths changed in the latest commit at projectRoot. */
function submodulePointersChangedInHead(projectRoot) {
  try {
    const out = execFileSync(
      'git',
      ['-C', projectRoot, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }
    );
    const changed = new Set(out.split('\n').map(s => s.trim()).filter(Boolean));
    const submodules = parseGitmodules(projectRoot);
    return submodules.filter(sm => {
      for (const c of changed) {
        if (c === sm.path || c.startsWith(`${sm.path}/`)) return true;
      }
      return false;
    });
  } catch {
    return [];
  }
}

function resolveAnalyzeCommand() {
  try {
    execFileSync('gitnexus', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 2000 });
    return ['gitnexus', 'analyze'];
  } catch {
    return ['npx', 'gitnexus', 'analyze'];
  }
}

module.exports = {
  parseGitmodules,
  gitHead,
  indexedLastCommit,
  indexStatus,
  findProjectRoot,
  submoduleForPath,
  submodulePointersChangedInHead,
  resolveAnalyzeCommand,
  META,
};
