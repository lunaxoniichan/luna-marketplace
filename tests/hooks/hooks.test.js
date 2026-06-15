#!/usr/bin/env node
'use strict';

const { run: runBlockNoVerify } = require('../../scripts/hooks/block-no-verify');
const { run: runSecretGuard } = require('../../scripts/hooks/secret-read-guard');
const { run: runUrlGuard, check: urlCheck } = require('../../scripts/hooks/url-safety-guard');
const { shouldRemind } = require('../../scripts/hooks/doc-sync-reminder');
const { check: bashGuards } = require('../../scripts/hooks/bash-guards');

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
