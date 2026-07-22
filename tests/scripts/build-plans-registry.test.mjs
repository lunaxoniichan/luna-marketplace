#!/usr/bin/env node
/**
 * Plans registry — resolve moved plans into Completed section (contract §7).
 */
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  resolvePlanCurrentPath,
  buildRegistryMarkdown,
  COMPLETED_HEADING,
} from '../../scripts/build-plans-registry.mjs';

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(e);
  }
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

console.log('plans-registry lifecycle resolution\n');

const root = mkdtempSync(join(tmpdir(), 'plans-reg-'));
try {
  git(root, ['init']);
  git(root, ['config', 'user.email', 'r@test']);
  git(root, ['config', 'user.name', 'Reg Test']);
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  mkdirSync(join(root, 'docs/post-official/completed-plans'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# t\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'chore: init']);

  const logicalId = 'docs/plans/fixture.md';
  writeFileSync(join(root, logicalId), '# plan\n');
  git(root, ['add', '--', logicalId]);
  git(root, ['commit', '-m', 'feat: start\n\nPlan: docs/plans/fixture.md#phase-1\n']);

  // Move to completed-plans (simulating lifecycle demote)
  git(root, [
    'mv',
    '--',
    logicalId,
    'docs/post-official/completed-plans/fixture.md',
  ]);
  git(root, ['commit', '-m', 'docs(lifecycle): demote fixture']);

  test('resolvePlanCurrentPath finds completed-plans by basename', () => {
    const cur = resolvePlanCurrentPath(root, logicalId);
    assert.equal(cur, 'docs/post-official/completed-plans/fixture.md');
  });

  test('resolvePlanCurrentPath prefers live docs/plans path', () => {
    const live = 'docs/plans/live.md';
    writeFileSync(join(root, live), '# live\n');
    assert.equal(resolvePlanCurrentPath(root, live), live);
  });

  test('buildRegistryMarkdown puts archived plan in Completed section', () => {
    const commits = [
      {
        short: 'abc1234',
        date: '2026-07-19',
        subject: 'feat: start',
        plan: logicalId,
        phase: 'phase-1',
      },
    ];
    const md = buildRegistryMarkdown(root, commits, new Map());
    assert.match(md, new RegExp(COMPLETED_HEADING));
    const completedIdx = md.indexOf(COMPLETED_HEADING);
    const activeTable = md.slice(0, completedIdx);
    const completedTable = md.slice(completedIdx);
    assert.doesNotMatch(activeTable, /fixture\.md/);
    assert.match(completedTable, /docs\/plans\/fixture\.md/);
    assert.match(completedTable, /completed-plans\/fixture\.md/);
    assert.ok(existsSync(join(root, 'docs/post-official/completed-plans/fixture.md')));
  });

  test('completed row shows superseded status + successor link (P5a)', () => {
    // Give the archived plan superseded front-matter.
    writeFileSync(
      join(root, 'docs/post-official/completed-plans/fixture.md'),
      `---\ntitle: fixture\ntype: plan\nlifecycle: post_official\nstatus: superseded\nsuperseded_by: docs/plans/successor.md\n---\n\n# plan\n`,
    );
    const commits = [
      { short: 'abc1234', date: '2026-07-19', subject: 'feat: start', plan: logicalId, phase: 'phase-1' },
    ];
    const md = buildRegistryMarkdown(root, commits, new Map());
    const completedTable = md.slice(md.indexOf(COMPLETED_HEADING));
    assert.match(completedTable, /superseded/);
    assert.match(completedTable, /docs\/plans\/successor\.md/);
  });
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
