#!/usr/bin/env node
/**
 * build-knowledge — canonical rules/ corpus hygiene (Task 5 §3.3).
 */
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { GENERATED_MARKER } from '../../scripts/lib/agent-views.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

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

function run(cwd, env = {}) {
  return execFileSync('node', [join(ROOT, 'scripts/build-knowledge.mjs'), '--root', cwd], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

console.log('build-knowledge canonical hygiene\n');

test('indexes rules/ not .claude/rules mirrors; keeps lessons.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'know-canon-'));
  const reg = mkdtempSync(join(tmpdir(), 'know-reg-'));
  try {
    mkdirSync(join(dir, 'rules'), { recursive: true });
    mkdirSync(join(dir, 'docs/specs'), { recursive: true });
    mkdirSync(join(dir, 'memory'), { recursive: true });
    mkdirSync(join(dir, '.claude/rules'), { recursive: true });

    writeFileSync(
      join(dir, 'rules/core.md'),
      '---\ntitle: Core\nkeywords: [core]\n---\n\nCanonical core.\n',
    );
    writeFileSync(
      join(dir, '.claude/rules/core.md'),
      `<!-- ${GENERATED_MARKER} — DO NOT EDIT -->\n\nCanonical core.\n`,
    );
    writeFileSync(join(dir, '.claude/rules/lessons.md'), '- AVOID x — DO y\n');
    writeFileSync(
      join(dir, 'docs/specs/note.md'),
      '---\ntitle: Note\ntype: spec\nlifecycle: official\n---\n\nHi\n',
    );
    writeFileSync(
      join(dir, 'memory/m.md'),
      '---\ntitle: Mem\ntype: memory\nlifecycle: official\n---\n\nM\n',
    );

    writeFileSync(
      join(reg, 'registry.json'),
      JSON.stringify({ version: 1, projects: [] }, null, 2),
    );

    run(dir, { LUNA_REGISTRY_DIR: reg });
    const know = JSON.parse(readFileSync(join(dir, 'docs/generated/knowledge.json'), 'utf8'));
    const paths = know.items.map((i) => i.path).sort();
    assert.ok(paths.includes('rules/core.md'), `expected rules/core.md in ${paths}`);
    assert.ok(!paths.includes('.claude/rules/core.md'), 'must not index generated mirror');
    assert.ok(paths.includes('.claude/rules/lessons.md'), 'lessons kept');
    assert.ok(paths.includes('docs/specs/note.md'));
    assert.ok(paths.includes('memory/m.md'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(reg, { recursive: true, force: true });
  }
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
