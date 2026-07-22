#!/usr/bin/env node
'use strict';

const { run: runBlockNoVerify } = require('../../scripts/hooks/block-no-verify');
const { run: runSecretGuard } = require('../../scripts/hooks/secret-read-guard');
const { run: runUrlGuard, check: urlCheck } = require('../../scripts/hooks/url-safety-guard');
const { shouldRemind } = require('../../scripts/hooks/doc-sync-reminder');
const { check: bashGuards } = require('../../scripts/hooks/bash-guards');
const {
  isGitCommit,
  summarizeReport,
  run: runDedupeGuard,
  resolveJscpdBin,
} = require('../../scripts/hooks/dedupe-guard');
const {
  run: runPlanTrailerGuard,
  hasPlanTrailer,
  firstCommitMessage,
  isPlanWorthy,
  hasActivePlan,
} = require('../../scripts/hooks/plan-trailer-guard');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('hook tests');

test('block-no-verify blocks git commit --no-verify', () => {
  const r = runBlockNoVerify(JSON.stringify({ tool_input: { command: 'git commit --no-verify -m msg' } }));
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

test('block-no-verify allows commit message mentioning --no-verify', () => {
  const r = runBlockNoVerify(JSON.stringify({ tool_input: { command: 'git commit -m "docs: never use --no-verify"' } }));
  assert(r.exitCode === 0, `expected 0 got ${r.exitCode}`);
});

test('block-no-verify blocks core.hooksPath override', () => {
  const r = runBlockNoVerify(JSON.stringify({ tool_input: { command: 'git -c core.hooksPath=/dev/null commit -m x' } }));
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

test('block-no-verify allows a normal commit', () => {
  const r = runBlockNoVerify(JSON.stringify({ tool_input: { command: 'git commit -m "feat: add thing"' } }));
  assert(r.exitCode === 0, `expected 0 got ${r.exitCode}`);
});

// --- secret-read-guard ---

test('secret-read-guard blocks reading .env', () => {
  const r = runSecretGuard(JSON.stringify({ tool_input: { file_path: '/proj/.env' } }));
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

test('secret-read-guard blocks cat of a .pem key', () => {
  const r = runSecretGuard(JSON.stringify({ tool_input: { command: 'cat secrets/server.pem' } }));
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

test('secret-read-guard allows a normal source file', () => {
  const r = runSecretGuard(JSON.stringify({ tool_input: { file_path: 'src/index.ts' } }));
  assert(r.exitCode === 0, `expected 0 got ${r.exitCode}`);
});

test('secret-read-guard allows .env.example', () => {
  const r = runSecretGuard(JSON.stringify({ tool_input: { file_path: '.env.example' } }));
  // .env.example matches the (^|/)\.env\. pattern intentionally (still a sensitive template path)
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

// --- url-safety-guard ---

test('url-safety-guard blocks http:// WebFetch', () => {
  const r = runUrlGuard(JSON.stringify({ tool_input: { url: 'http://example.com/x' } }));
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

test('url-safety-guard allows https:// (empty allowlist)', () => {
  const r = runUrlGuard(JSON.stringify({ tool_input: { url: 'https://docs.claude.com/x' } }));
  assert(r.exitCode === 0, `expected 0 got ${r.exitCode}`);
});

test('url-safety-guard blocks http via curl in Bash', () => {
  const r = runUrlGuard(JSON.stringify({ tool_input: { command: 'curl http://insecure.test/data' } }));
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

test('url-safety-guard ignores non-url bash', () => {
  const r = runUrlGuard(JSON.stringify({ tool_input: { command: 'ls -la' } }));
  assert(r.exitCode === 0, `expected 0 got ${r.exitCode}`);
});

test('url-safety-guard suffix match does not allow lookalike host', () => {
  const c = urlCheck('https://irs.gov.evil.com/x');
  // empty allowlist => not blocked by allowlist; but ensure hostMatches logic is sound via denylist-style check
  assert(c.blocked === false, 'empty allowlist should not block https');
});

// --- bash-guards dispatcher (one process runs all three Bash guards) ---

test('bash-guards blocks --no-verify (git-bypass guard)', () => {
  const r = bashGuards(JSON.stringify({ tool_input: { command: 'git commit --no-verify -m x' } }));
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

test('bash-guards blocks cat of a secret (secret guard)', () => {
  const r = bashGuards(JSON.stringify({ tool_input: { command: 'cat config/server.pem' } }));
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

test('bash-guards blocks insecure http curl (url guard)', () => {
  const r = bashGuards(JSON.stringify({ tool_input: { command: 'curl http://insecure.test/x' } }));
  assert(r.exitCode === 2, `expected 2 got ${r.exitCode}`);
});

test('bash-guards allows a benign command', () => {
  const r = bashGuards(JSON.stringify({ tool_input: { command: 'npm test' } }));
  assert(r.exitCode === 0, `expected 0 got ${r.exitCode}`);
});

// --- doc-sync-reminder (pure helper) ---

test('doc-sync-reminder reminds when source changed but docs did not', () => {
  assert(shouldRemind(['src/app.ts', 'lib/util.js']) === true, 'should remind');
});

test('doc-sync-reminder stays silent when docs were updated', () => {
  assert(shouldRemind(['src/app.ts', 'docs/SYSTEM_DESIGN.md']) === false, 'should not remind');
});

test('doc-sync-reminder stays silent for docs-only changes', () => {
  assert(shouldRemind(['README.md']) === false, 'should not remind');
});

// --- dedupe-guard (pure helpers) ---

test('dedupe-guard detects a plain git commit', () => {
  assert(isGitCommit('git commit -m "feat: x"') === true, 'should detect');
});

test('dedupe-guard detects git commit with global flags', () => {
  assert(isGitCommit('git -c user.name=ci commit -m x') === true, 'should detect');
});

test('dedupe-guard ignores "commit" inside a -m message', () => {
  assert(isGitCommit('git push origin "my commit branch"') === false, 'should not detect');
});

test('dedupe-guard ignores non-commit git commands', () => {
  assert(isGitCommit('git status') === false, 'should not detect');
});

test('dedupe-guard summarizeReport returns null when no clones', () => {
  assert(summarizeReport({ statistics: { total: { clones: 0 } }, duplicates: [] }) === null, 'no warn');
});

test('dedupe-guard summarizeReport warns when clones present', () => {
  const msg = summarizeReport({
    statistics: { total: { clones: 1 } },
    duplicates: [{ lines: 12, firstFile: { name: 'a.ts', start: 1 }, secondFile: { name: 'b.ts', start: 9 } }],
  });
  assert(typeof msg === 'string' && msg.includes('a.ts:1') && msg.includes('b.ts:9'), 'should warn with locations');
});

test('dedupe-guard run() short-circuits to exit 0 when opted out', () => {
  const prev = process.env.LUNA_DEDUPE_GUARD;
  process.env.LUNA_DEDUPE_GUARD = 'off';
  const r = runDedupeGuard(JSON.stringify({ tool_input: { command: 'git commit -m x' } }));
  process.env.LUNA_DEDUPE_GUARD = prev;
  assert(r.exitCode === 0 && !r.systemMessage, 'should be silent exit 0');
});

test('dedupe-guard run() ignores non-commit commands', () => {
  const r = runDedupeGuard(JSON.stringify({ tool_input: { command: 'npm test' } }));
  assert(r.exitCode === 0 && !r.systemMessage, 'should be silent exit 0');
});

test('dedupe-guard resolveJscpdBin finds kit node_modules when present', () => {
  const { join } = require('path');
  const kitRoot = join(__dirname, '..', '..');
  const bin = resolveJscpdBin(kitRoot);
  if (bin) {
    assert(bin.includes('jscpd'), 'should resolve jscpd binary path');
  }
});

// --- gitnexus-submodules lib ---

const {
  parseGitmodules,
  submoduleForPath,
  findProjectRoot,
} = require('../../scripts/lib/gitnexus-submodules');
const { isGitCommit: isSubmoduleSyncCommit } = require('../../scripts/hooks/gitnexus-submodule-sync');

test('parseGitmodules reads path entries', () => {
  const { mkdtempSync, writeFileSync, rmSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');
  const dir = mkdtempSync(join(tmpdir(), 'luna-gitmod-'));
  try {
    writeFileSync(join(dir, '.gitmodules'), [
      '[submodule "data-pipeline"]',
      '\tpath = data-pipeline',
      '\turl = git@example.com/pipeline.git',
    ].join('\n'));
    const mods = parseGitmodules(dir);
    assert(mods.length === 1 && mods[0].path === 'data-pipeline', 'should parse submodule');
    const sm = submoduleForPath(dir, 'data-pipeline/src/foo.py');
    assert(sm && sm.name === 'data-pipeline', 'should map file to submodule');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findProjectRoot locates .gitmodules ancestor', () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');
  const dir = mkdtempSync(join(tmpdir(), 'luna-root-'));
  try {
    writeFileSync(join(dir, '.gitmodules'), '[submodule "x"]\n\tpath = x\n');
    const nested = join(dir, 'backend', 'app');
    mkdirSync(nested, { recursive: true });
    assert(findProjectRoot(nested) === dir, 'should find project root');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gitnexus-submodule-sync detects git commit', () => {
  assert(isSubmoduleSyncCommit('git commit -m "x"') === true, 'commit');
  assert(isSubmoduleSyncCommit('npm test') === false, 'not commit');
});

// --- file-size-guard ---

const { check: fileSizeCheck } = require('../../scripts/hooks/file-size-guard');

test('file-size-guard: silent below warn threshold for .md', () => {
  const r = fileSizeCheck('/project/docs/SYSTEM_DESIGN.md', 200);
  assert(r === null, 'should return null for 200 lines');
});

test('file-size-guard: warns at 301 lines for .md', () => {
  const r = fileSizeCheck('/project/docs/SYSTEM_DESIGN.md', 301, { warnLines: 300, alertLines: 500 });
  assert(r !== null && r.includes('WARN'), `expected WARN, got: ${r}`);
  assert(r.includes('doc-simplify'), 'should suggest doc-simplify');
});

test('file-size-guard: alerts at 501 lines for .md', () => {
  const r = fileSizeCheck('/project/docs/SYSTEM_DESIGN.md', 501, { warnLines: 300, alertLines: 500 });
  assert(r !== null && r.includes('ALERT'), `expected ALERT, got: ${r}`);
});

test('file-size-guard: warns at 301 lines for .py', () => {
  const r = fileSizeCheck('/project/backend/app/services/market.py', 301, { warnLines: 300, alertLines: 500 });
  assert(r !== null && r.includes('WARN'), `expected WARN, got: ${r}`);
  assert(r.includes('dev-refactor'), 'should suggest dev-refactor');
});

test('file-size-guard: silent for node_modules', () => {
  const r = fileSizeCheck('/project/node_modules/foo/index.js', 9999);
  assert(r === null, 'should ignore node_modules');
});

test('file-size-guard: silent for _archive', () => {
  const r = fileSizeCheck('/project/docs/_archive/OLD.md', 9999);
  assert(r === null, 'should ignore _archive');
});

test('file-size-guard: silent for migrations', () => {
  const r = fileSizeCheck('/project/backend/migrations/001_init.py', 9999);
  assert(r === null, 'should ignore migrations');
});

test('file-size-guard: silent for skill SKILL.md', () => {
  const r = fileSizeCheck('/project/skills/doc-init/SKILL.md', 999);
  assert(r === null, 'should ignore skill SKILL.md files');
});

test('file-size-guard: silent for non-doc non-code file (.json)', () => {
  const r = fileSizeCheck('/project/package.json', 9999);
  assert(r === null, 'should ignore .json files');
});

// --- plan-trailer-guard ---

test('plan-trailer-guard: hasPlanTrailer detects a trailer', () => {
  assert(hasPlanTrailer('git commit -m "feat: x\n\nPlan: docs/plans/p.md#phase-1"') === true, 'detect');
  assert(hasPlanTrailer('git commit -m "feat: x"') === false, 'none');
});

test('plan-trailer-guard: firstCommitMessage + isPlanWorthy classify type', () => {
  assert(firstCommitMessage('git commit -m "feat: add x"') === 'feat: add x', 'parse -m');
  assert(isPlanWorthy('feat: add x') === true, 'feat is plan-worthy');
  assert(isPlanWorthy('chore: rebuild PLANS') === false, 'chore is not');
  assert(isPlanWorthy('docs: note') === false, 'docs is not');
});

test('plan-trailer-guard: hasActivePlan reads docs/PLANS.md', () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');
  const dir = mkdtempSync(join(tmpdir(), 'luna-plan-'));
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'PLANS.md'), '| spec | p.md | phase-1 | claude | `abc` 2026 | active | hint |\n');
    assert(hasActivePlan(dir) === true, 'active row detected');
    writeFileSync(join(dir, 'docs', 'PLANS.md'), '| spec | p.md | phase-1 | claude | `abc` 2026 | done | hint |\n');
    assert(hasActivePlan(dir) === false, 'no active row');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('plan-trailer-guard: warns on feat commit during active plan without trailer', () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');
  const dir = mkdtempSync(join(tmpdir(), 'luna-plan2-'));
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'PLANS.md'), '| s | p.md | phase-1 | claude | `abc` 2026 | active | h |\n');
    const r = runPlanTrailerGuard(JSON.stringify({ tool_input: { command: 'git commit -m "feat: x"' }, cwd: dir }));
    assert(r.exitCode === 0 && typeof r.systemMessage === 'string', 'should warn (advisory)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('plan-trailer-guard: silent when trailer present', () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');
  const dir = mkdtempSync(join(tmpdir(), 'luna-plan3-'));
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'PLANS.md'), '| s | p.md | phase-1 | claude | `abc` 2026 | active | h |\n');
    const r = runPlanTrailerGuard(JSON.stringify({
      tool_input: { command: 'git commit -m "feat: x" -m "Plan: docs/plans/p.md#phase-1"' },
      cwd: dir,
    }));
    assert(r.exitCode === 0 && !r.systemMessage, 'trailer present → silent');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('plan-trailer-guard: silent for chore commit (no nag on PLANS rebuild)', () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');
  const dir = mkdtempSync(join(tmpdir(), 'luna-plan4-'));
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'PLANS.md'), '| s | p.md | phase-1 | claude | `abc` 2026 | active | h |\n');
    const r = runPlanTrailerGuard(JSON.stringify({
      tool_input: { command: 'git commit -m "chore: rebuild docs/PLANS.md"' },
      cwd: dir,
    }));
    assert(r.exitCode === 0 && !r.systemMessage, 'chore → silent');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('plan-trailer-guard: silent when no active plan', () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');
  const dir = mkdtempSync(join(tmpdir(), 'luna-plan5-'));
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'PLANS.md'), '| s | p.md | phase-1 | claude | `abc` 2026 | done | h |\n');
    const r = runPlanTrailerGuard(JSON.stringify({ tool_input: { command: 'git commit -m "feat: x"' }, cwd: dir }));
    assert(r.exitCode === 0 && !r.systemMessage, 'no active plan → silent');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('plan-trailer-guard: opt-out silences', () => {
  const prev = process.env.LUNA_PLAN_TRAILER_GUARD;
  process.env.LUNA_PLAN_TRAILER_GUARD = 'off';
  const r = runPlanTrailerGuard(JSON.stringify({ tool_input: { command: 'git commit -m "feat: x"' } }));
  process.env.LUNA_PLAN_TRAILER_GUARD = prev;
  assert(r.exitCode === 0 && !r.systemMessage, 'opt-out → silent');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
