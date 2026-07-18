#!/usr/bin/env node
/**
 * sync-agent-views contract tests — hermetic temp project.
 */
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join, dirname as pathDirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(pathDirname(fileURLToPath(import.meta.url)), '../..');
const mod = await import(pathToFileURL(join(ROOT, 'scripts/lib/agent-views.mjs')).href);
const {
  syncAgentViews,
  hasGeneratedMarker,
  isProtectedName,
  buildPlan,
  claudeProjectSlug,
  GENERATED_MARKER,
  renderClaudeRule,
} = mod;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL ${msg}`);
    failed++;
  } else {
    console.log(`  ok ${msg}`);
  }
}

console.log('sync-agent-views contract');

assert(isProtectedName('lessons.md'), 'lessons.md protected');
assert(isProtectedName('foo.local.md'), '*.local.md protected');
assert(!isProtectedName('core.md'), 'core.md not protected');

const dir = mkdtempSync(join(tmpdir(), 'luna-sync-'));
try {
  mkdirSync(join(dir, 'rules'), { recursive: true });
  mkdirSync(join(dir, 'memory'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'generated'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'rules'), { recursive: true });
  mkdirSync(join(dir, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'rules', 'lessons.md'), '# Lessons\n- keep me\n');
  writeFileSync(join(dir, 'rules', 'core.md'), '# Core\n\n1. User wins\n');
  writeFileSync(
    join(dir, 'memory', 'note.md'),
    '---\ntitle: Note\ntype: memory\nlifecycle: official\nstatus: active\n---\n\nHello memory.\n'
  );

  // Plant fake native memory that must NEVER be written
  const nativeMem = join(dir, 'fake-home', '.claude', 'projects', 'x', 'memory');
  mkdirSync(nativeMem, { recursive: true });
  writeFileSync(join(nativeMem, 'MEMORY.md'), '# agent owned\n');
  writeFileSync(join(nativeMem, 'agent-note.md'), 'secret agent memory\n');

  let r = syncAgentViews(dir);
  assert(r.exitCode === 0, `first sync ok (${r.message})`);
  // 2 rules (claude+cursor) + 1 mcp feed = 3
  assert(r.classified.write.length === 3, `wrote 3 (got ${r.classified.write.length})`);

  const claudeRule = join(dir, '.claude', 'rules', 'core.md');
  const cursorRule = join(dir, '.cursor', 'rules', 'core.mdc');
  const feed = join(dir, 'docs', 'generated', 'mcp-memory-feed.json');
  const lessons = join(dir, '.claude', 'rules', 'lessons.md');

  assert(existsSync(claudeRule), 'claude rule written');
  assert(existsSync(cursorRule), 'cursor rule written');
  assert(existsSync(feed), 'mcp feed written');
  assert(hasGeneratedMarker(readFileSync(claudeRule, 'utf8')), 'claude has marker');
  assert(hasGeneratedMarker(readFileSync(cursorRule, 'utf8')), 'cursor has marker');
  assert(readFileSync(lessons, 'utf8').includes('keep me'), 'lessons.md untouched');

  // Claude rule: comment only, no visible # GENERATED heading
  const claudeText = readFileSync(claudeRule, 'utf8');
  assert(claudeText.includes(GENERATED_MARKER), 'claude has HTML marker');
  assert(!/^# GENERATED/m.test(claudeText), 'claude has no visible GENERATED heading');

  // Memory must not appear as write kinds / must not touch native paths
  assert(
    !r.plan.writes.some((w) => w.kind === 'claude-memory' || w.kind === 'claude-memory-index'),
    'no claude-memory write kinds'
  );
  assert(
    !r.plan.writes.some((w) => w.path.includes(`${join('.claude', 'projects')}`) || w.path.includes('/memory/MEMORY.md')),
    'no writes into native memory dirs'
  );
  assert(readFileSync(join(nativeMem, 'MEMORY.md'), 'utf8').includes('agent owned'), 'native MEMORY untouched');

  const feedJson = JSON.parse(readFileSync(feed, 'utf8'));
  assert(feedJson.schema_version === 1, 'feed schema_version');
  assert(feedJson.memories.length === 1 && feedJson.memories[0].title === 'Note', 'feed has memory');

  // Idempotent
  r = syncAgentViews(dir);
  assert(r.exitCode === 0 && r.classified.write.length === 0, `second sync noop (${r.message})`);
  r = syncAgentViews(dir, { check: true });
  assert(r.exitCode === 0, 'check green after sync');
  r = syncAgentViews(dir, { check: true });
  assert(r.exitCode === 0, 'check green twice');

  // Clobber: local edit of marked file with manifest → abort
  writeFileSync(claudeRule, readFileSync(claudeRule, 'utf8') + '\n# local hack\n');
  r = syncAgentViews(dir);
  assert(r.exitCode === 2, `clobber refused exit 2 (got ${r.exitCode})`);
  assert(r.message.includes('local-modifications'), 'local-modifications reason');
  assert(readFileSync(claudeRule, 'utf8').includes('local hack'), 'local edit preserved');

  // Restore via deleting local hack content to desired, then wipe manifest = fresh clone case
  writeFileSync(claudeRule, renderClaudeRule('# Core\n\n1. User wins\n'));
  // Stale content vs new canonical: change source
  writeFileSync(join(dir, 'rules', 'core.md'), '# Core\n\n1. User wins\n2. Fail loud\n');
  rmSync(join(dir, '.luna'), { recursive: true, force: true });
  r = syncAgentViews(dir);
  assert(r.exitCode === 0, `fresh-clone adopt+regen ok (${r.message})`);
  assert(r.classified.adopts?.length >= 1, 'adopted marked-no-manifest');
  assert(readFileSync(claudeRule, 'utf8').includes('Fail loud'), 'regenerated from canonical');

  // Hand-authored without marker → abort
  writeFileSync(claudeRule, 'hand authored without marker\n');
  r = syncAgentViews(dir);
  assert(r.exitCode === 2, 'hand-authored without marker refused');
  assert(r.message.includes('hand-authored'), 'hand-authored reason');

  // Orphan warn: delete memory source, sync should warn (feed updates; no native orphan for memory)
  // For rules orphan: remove rules/core.md after a clean sync
  writeFileSync(claudeRule, renderClaudeRule('# Core\n\n1. User wins\n2. Fail loud\n'));
  // Fix conflict first by restoring marked content and syncing
  rmSync(join(dir, '.luna'), { recursive: true, force: true });
  r = syncAgentViews(dir); // adopt again
  assert(r.exitCode === 0, 'recover from hand-authored by rewriting marked then sync');

  rmSync(join(dir, 'rules', 'core.md'));
  r = syncAgentViews(dir);
  assert(r.exitCode === 0, 'sync after canonical delete');
  assert(r.orphans?.some((o) => o.path === claudeRule || o.path === cursorRule), 'orphan warned');
  assert(existsSync(claudeRule), 'orphan file left on disk (warn-only)');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nsync-agent-views contract ok');
