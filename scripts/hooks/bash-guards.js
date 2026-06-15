#!/usr/bin/env node
/**
 * PreToolUse(Bash) dispatcher — runs all Node Bash guards in ONE process.
 *
 * Replaces three separate hook entries (block-no-verify, secret-read-guard,
 * url-safety-guard) so a Bash tool call spawns one Node process instead of
 * three. Each guard still owns its own `run(rawInput)` logic, opt-out env var,
 * and tests; this file only sequences them and returns the first block.
 *
 * First guard to return exitCode 2 wins (its stderr is fed back to Claude).
 * Order: git-bypass → secret-file → insecure-URL.
 *
 * Exit codes: 0 = allow · 2 = block.
 */

'use strict';

const { run: runBlockNoVerify } = require('./block-no-verify');
const { run: runSecretGuard } = require('./secret-read-guard');
const { run: runUrlGuard } = require('./url-safety-guard');

const MAX_STDIN = 1024 * 1024;

// Pure, testable core: first guard to block wins.
function check(rawInput) {
  for (const guard of [runBlockNoVerify, runSecretGuard, runUrlGuard]) {
    const r = guard(rawInput);
    if (r && r.exitCode === 2) return r;
  }
  return { exitCode: 0 };
}

module.exports = { check };

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    const r = check(raw);
    if (r.exitCode === 2) {
      process.stderr.write(r.stderr + '\n');
      process.exit(2);
    }
    process.exit(0);
  });
}
