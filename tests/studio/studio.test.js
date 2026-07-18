#!/usr/bin/env node
'use strict';

const { execSync } = require('node:child_process');
const { join } = require('node:path');

const ROOT = join(__dirname, '..', '..');
const env = {
  ...process.env,
  LUNA_PLUGIN_ROOT: ROOT,
  LUNA_STUDIO_ROOT: join(ROOT, 'studio'),
  LUNA_STUDIO_FIXTURES: '1',
};

console.log('studio tests');

execSync('node tests/studio/validate-loaders.mjs', {
  cwd: ROOT,
  encoding: 'utf8',
  env,
  stdio: 'inherit',
});
console.log('  ok validate-loaders');

execSync('node --experimental-strip-types tests/studio/edge-semantics.test.mjs', {
  cwd: ROOT,
  encoding: 'utf8',
  env,
  stdio: 'inherit',
});
console.log('  ok edge-semantics');

execSync('npm --prefix studio run typecheck', {
  cwd: ROOT,
  encoding: 'utf8',
  env,
  stdio: 'inherit',
});
console.log('  ok typecheck');

console.log('\n3 passed, 0 failed');
