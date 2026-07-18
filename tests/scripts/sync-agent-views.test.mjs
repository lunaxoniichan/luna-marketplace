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
  readdirSync,
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

// Phase 1 — buildPlan(writeRoot, { rulesSourceDir, memorySourceDir }) decoupling
console.log('\nsync-agent-views buildPlan source/write split');
{
  const plugin = mkdtempSync(join(tmpdir(), 'luna-plugin-'));
  const consumer = mkdtempSync(join(tmpdir(), 'luna-consumer-'));
  try {
    mkdirSync(join(plugin, 'rules'), { recursive: true });
    mkdirSync(join(consumer, 'memory'), { recursive: true });
    writeFileSync(join(plugin, 'rules', 'fleet.md'), '# Fleet\n\nshared body\n');
    writeFileSync(
      join(consumer, 'memory', 'local.md'),
      '---\ntitle: Local\ntype: memory\n---\n\nconsumer memory\n'
    );
    // Consumer has NO rules/ — fleet must still plan writes under consumer
    const plan = buildPlan(consumer, {
      rulesSourceDir: join(plugin, 'rules'),
      memorySourceDir: join(consumer, 'memory'),
    });
    assert(
      plan.writes.some(
        (w) =>
          w.kind === 'claude-rule' &&
          w.path === join(consumer, '.claude', 'rules', 'fleet.md') &&
          w.desired.includes('shared body')
      ),
      'claude write under consumer from plugin rules'
    );
    assert(
      plan.writes.some(
        (w) =>
          w.kind === 'cursor-rule' &&
          w.path === join(consumer, '.cursor', 'rules', 'fleet.mdc')
      ),
      'cursor write under consumer from plugin rules'
    );
    assert(
      plan.writes.some(
        (w) =>
          w.kind === 'mcp-feed' &&
          w.path === join(consumer, 'docs', 'generated', 'mcp-memory-feed.json') &&
          w.desired.includes('Local')
      ),
      'mcp feed from consumer memory only'
    );
    assert(
      !plan.writes.some((w) => w.path.startsWith(plugin)),
      'no writes into plugin tree'
    );

    // Defaults preserved: bare buildPlan(root) still reads root/rules + root/memory
    mkdirSync(join(consumer, 'rules'), { recursive: true });
    writeFileSync(join(consumer, 'rules', 'local-only.md'), '# Local only\n');
    const localPlan = buildPlan(consumer);
    assert(
      localPlan.writes.some((w) => w.path.endsWith('local-only.md')),
      'default buildPlan still uses writeRoot/rules'
    );
    assert(
      !localPlan.writes.some((w) => w.path.endsWith('fleet.md')),
      'default buildPlan ignores sibling plugin rules'
    );
  } finally {
    rmSync(plugin, { recursive: true, force: true });
    rmSync(consumer, { recursive: true, force: true });
  }
}

// Phase 2 — adopt-unmarked migration (§4.1)
console.log('\nsync-agent-views adopt-unmarked migration');
{
  const plugin = mkdtempSync(join(tmpdir(), 'luna-plugin-mig-'));
  const consumer = mkdtempSync(join(tmpdir(), 'luna-consumer-mig-'));
  try {
    mkdirSync(join(plugin, 'rules'), { recursive: true });
    mkdirSync(join(consumer, '.claude', 'rules'), { recursive: true });
    mkdirSync(join(consumer, '.cursor', 'rules'), { recursive: true });
    mkdirSync(join(consumer, 'memory'), { recursive: true });
    writeFileSync(join(plugin, 'rules', 'core.md'), '# Core\n\nfleet body\n');
    // Pre-existing unmarked (old doc-init mirror)
    writeFileSync(join(consumer, '.claude', 'rules', 'core.md'), '# Core\n\nold hand mirror\n');
    writeFileSync(join(consumer, '.cursor', 'rules', 'core.mdc'), '---\ndescription: old\n---\n\nold cursor\n');
    writeFileSync(join(consumer, '.claude', 'rules', 'lessons.md'), '# Lessons\n- keep\n');
    writeFileSync(join(consumer, '.claude', 'rules', 'mine.local.md'), 'local only\n');

    const syncOpts = {
      rulesSourceDir: join(plugin, 'rules'),
      memorySourceDir: join(consumer, 'memory'),
      origin: 'plugin',
    };

    // 1. Default → conflict; no aside created
    let r = syncAgentViews(consumer, syncOpts);
    assert(r.exitCode === 2, `default unmarked → conflict (got ${r.exitCode})`);
    assert(r.message.includes('hand-authored'), 'hand-authored reason without adopt');
    const asideGlob = readdirSync(join(consumer, '.claude', 'rules')).filter((f) =>
      f.includes('pre-fleet')
    );
    assert(asideGlob.length === 0, 'no aside without --adopt-unmarked');
    assert(
      readFileSync(join(consumer, '.claude', 'rules', 'core.md'), 'utf8').includes('old hand mirror'),
      'unmarked file left intact on conflict'
    );

    // 2. --adopt-unmarked → aside + write + origin plugin; protected intact
    r = syncAgentViews(consumer, { ...syncOpts, adoptUnmarked: true });
    assert(r.exitCode === 0, `adopt-unmarked ok (${r.message})`);
    const claudeAside = readdirSync(join(consumer, '.claude', 'rules')).find((f) =>
      /^core\.md\.pre-fleet-\d{8}$/.test(f)
    );
    assert(claudeAside, `aside named core.md.pre-fleet-DATE (got ${claudeAside})`);
    assert(
      Boolean(claudeAside) && !claudeAside.endsWith('.md'),
      'aside not auto-loadable as *.md'
    );
    assert(
      readFileSync(join(consumer, '.claude', 'rules', claudeAside), 'utf8').includes('old hand mirror'),
      'aside preserves old content'
    );
    assert(
      hasGeneratedMarker(readFileSync(join(consumer, '.claude', 'rules', 'core.md'), 'utf8')),
      'new claude rule marked'
    );
    assert(
      readFileSync(join(consumer, '.claude', 'rules', 'core.md'), 'utf8').includes('fleet body'),
      'new claude rule from plugin'
    );
    assert(
      readFileSync(join(consumer, '.claude', 'rules', 'lessons.md'), 'utf8').includes('keep'),
      'lessons untouched'
    );
    assert(
      readFileSync(join(consumer, '.claude', 'rules', 'mine.local.md'), 'utf8').includes('local only'),
      '*.local untouched'
    );
    const man = JSON.parse(
      readFileSync(join(consumer, '.luna', 'agent-views-manifest.json'), 'utf8')
    );
    const claudeEntry = man.targets[join(consumer, '.claude', 'rules', 'core.md')];
    assert(claudeEntry?.origin === 'plugin', `manifest origin plugin (got ${claudeEntry?.origin})`);

    // 3. Idempotent second run without adopt
    r = syncAgentViews(consumer, { ...syncOpts, check: true });
    assert(r.exitCode === 0, `second check green after migrate (${r.message})`);
    r = syncAgentViews(consumer, syncOpts);
    assert(r.exitCode === 0 && r.classified.write.length === 0, 'second apply noop');
  } finally {
    rmSync(plugin, { recursive: true, force: true });
    rmSync(consumer, { recursive: true, force: true });
  }
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nsync-agent-views contract ok');
