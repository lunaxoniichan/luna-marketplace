#!/usr/bin/env node
/**
 * Correction inbox — Phase 4.3 (S2) hermetic contract tests.
 * Contract: docs/specs/2026-07-20-context-pack-contract.md §D5 + §12.
 */
import assert from 'node:assert/strict';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  formatLessonLine,
  appendLesson,
  isDuplicateLesson,
  keywordSet,
  LESSON_MD_REL,
  LESSON_MDC_REL,
} from '../../scripts/lib/lessons-append.mjs';
import {
  listCorrectionCandidates,
  acceptCorrection,
  rejectCorrection,
  parsePendingFeedback,
} from '../../scripts/lib/correction-inbox.mjs';
import { assertAllowedPath } from '../../scripts/lib/vault-crud.mjs';

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(e);
  }
}

function sha8(s) {
  return createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
}

function makeVault(tag = 'ci') {
  const root = mkdtempSync(join(tmpdir(), `luna-${tag}-`));
  const id = `vault-${tag}-${sha8(root)}`;
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true });
  mkdirSync(join(root, '.cursor', 'rules'), { recursive: true });
  mkdirSync(join(root, 'memory'), { recursive: true });
  mkdirSync(join(root, '.git'), { recursive: true });
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(
    join(root, LESSON_MD_REL),
    '# Lessons — do not repeat\n\n- AVOID committing without tests — DO run the suite first (2026-01-01)\n',
  );
  writeFileSync(
    join(root, LESSON_MDC_REL),
    '# Lessons — do not repeat\n\n- AVOID committing without tests — DO run the suite first (2026-01-01)\n',
  );
  const registry = { projects: [{ id, path: root }] };
  return { root, id, registry };
}

function listFilesRecursive(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFilesRecursive(p, base, out);
    else out.push(relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

function readFileMap(root) {
  const map = {};
  for (const rel of listFilesRecursive(root)) map[rel] = readFileSync(join(root, rel), 'utf8');
  return map;
}

console.log('correction-inbox tests\n');

await test('formatLessonLine parity: em dash, trailing-period strip, portable prefix, date', () => {
  assert.equal(
    formatLessonLine({ what: 'rewriting auth.', preference: 're-derive planToken.', date: '2026-07-22' }),
    '- AVOID rewriting auth — DO re-derive planToken (2026-07-22)',
  );
  assert.equal(
    formatLessonLine({
      what: 'writing user files',
      preference: 'only touch repo',
      portable: true,
      date: '2026-07-22',
    }),
    '- [portable] AVOID writing user files — DO only touch repo (2026-07-22)',
  );
  assert.throws(
    () => formatLessonLine({ what: '', preference: 'x' }),
    (e) => e && e.code === 'LESSON_FIELDS',
  );
});

await test('accept appends ONE line to BOTH lessons.md + lessons.mdc; nothing else written', async () => {
  const { root, id, registry } = makeVault('accept');
  const before = readFileMap(root);

  const res = acceptCorrection({
    vaultId: id,
    candidateId: 'c1',
    what_claude_did: 'skipping impact analysis',
    implied_preference: 'run gitnexus_impact before edits',
    registry,
    date: '2026-07-22',
  });
  assert.equal(res.ok, true);
  assert.equal(res.appended, true);
  assert.deepEqual([...res.targets].sort(), [LESSON_MD_REL, LESSON_MDC_REL].sort());

  const after = readFileMap(root);
  // Only the two lesson files changed
  const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
  const added = Object.keys(after).filter((k) => !(k in before));
  assert.deepEqual(added, [], `no new files expected, got ${added}`);
  assert.deepEqual([...changed].sort(), [LESSON_MD_REL, LESSON_MDC_REL].sort());

  // Exactly one appended line, identical in both, matching the formatter
  const expected = '- AVOID skipping impact analysis — DO run gitnexus_impact before edits (2026-07-22)';
  for (const rel of [LESSON_MD_REL, LESSON_MDC_REL]) {
    const lines = after[rel].split('\n').filter(Boolean);
    assert.ok(lines.includes(expected), `${rel} missing appended line`);
    assert.equal(before[rel].split('\n').filter(Boolean).length + 1, lines.length);
  }
});

await test('accept never writes memory/ or native memory', async () => {
  const { root, id, registry } = makeVault('nomem');
  acceptCorrection({
    vaultId: id,
    what_claude_did: 'x thing',
    implied_preference: 'y thing',
    registry,
    date: '2026-07-22',
  });
  const files = listFilesRecursive(root);
  assert.ok(!files.some((f) => f.startsWith('memory/')), 'must not write vault memory/');
});

await test('accept dedup: near-identical lesson not appended twice', async () => {
  const { root, id, registry } = makeVault('dedup');
  const args = {
    vaultId: id,
    what_claude_did: 'force pushing to main branch',
    implied_preference: 'never force push main without asking',
    registry,
    date: '2026-07-22',
  };
  const first = acceptCorrection(args);
  assert.equal(first.appended, true);
  const second = acceptCorrection({ ...args, date: '2026-07-23' });
  assert.equal(second.appended, false);
  assert.equal(second.deduped, true);

  const md = readFileSync(join(root, LESSON_MD_REL), 'utf8');
  const hits = md.split('\n').filter((l) => l.includes('force push')).length;
  assert.equal(hits, 1, 'dedup must keep a single force-push lesson');
});

await test('reject writes nothing durable', async () => {
  const { root, id, registry } = makeVault('reject');
  const before = readFileMap(root);
  const res = rejectCorrection({ vaultId: id, candidateId: 'c9', registry });
  assert.equal(res.ok, true);
  assert.equal(res.appended, false);
  assert.equal(res.rejected, true);
  assert.deepEqual(readFileMap(root), before, 'reject must not change any file');
});

await test('two-writer negative: lessons.md via vault-crud path is PATH_PROTECTED', () => {
  const { root } = makeVault('protected');
  assert.throws(
    () => assertAllowedPath(root, LESSON_MD_REL),
    (e) => e && e.code === 'PATH_PROTECTED',
    'routing a lesson through vault-crud must be refused',
  );
});

await test('listCorrectionCandidates is read-only + parses pending + flags duplicates', () => {
  const { root, id, registry } = makeVault('list');
  const pendingFile = join(root, '.pending.md');
  writeFileSync(
    pendingFile,
    `# Pending feedback\n\n## 2026-07-20\n` +
      `- **What Claude did:** committing without tests\n` +
      `- **What user said:** always run the suite\n` +
      `- **Implied preference:** run the suite before committing\n\n` +
      `## 2026-07-21\n` +
      `- **What Claude did:** inventing a new retriever\n` +
      `- **What user said:** reuse graph-memory\n` +
      `- **Implied preference:** reuse existing retrieval lanes\n`,
  );

  const before = readFileMap(root);
  const out = listCorrectionCandidates({ vaultId: id, registry, pendingFile });
  assert.equal(out.ok, true);
  assert.equal(out.candidates.length, 2);
  // first candidate overlaps the seeded "commit without tests" lesson → duplicate
  const dup = out.candidates.find((c) => c.what_claude_did.includes('committing without tests'));
  assert.equal(dup.duplicate, true, 'existing lesson should mark candidate duplicate');
  const fresh = out.candidates.find((c) => c.what_claude_did.includes('new retriever'));
  assert.equal(fresh.duplicate, false);
  assert.ok(fresh.candidate_id && fresh.candidate_id.length === 12);
  // read-only
  assert.deepEqual(readFileMap(root), before, 'listing must not write');
});

await test('parsePendingFeedback ignores malformed blocks', () => {
  const blocks = parsePendingFeedback('noise\n## 2026-07-20\n- not a field\n- **Implied preference:** do X\n');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].implied_preference, 'do X');
});

await test('appendLesson refuses missing vaultRoot / fields', () => {
  assert.throws(
    () => appendLesson({ what: 'a', preference: 'b' }),
    (e) => e && e.code === 'VAULT_ROOT',
  );
});

await test('isDuplicateLesson matches portable + plain bullets', () => {
  const existing = '- [portable] AVOID leaking secrets — DO redact tokens (2026-01-01)\n';
  assert.equal(isDuplicateLesson(existing, keywordSet('leaking secrets redact tokens')), true);
  assert.equal(isDuplicateLesson(existing, keywordSet('unrelated widget doodle thing')), false);
});

process.exit(failed ? 1 : 0);
