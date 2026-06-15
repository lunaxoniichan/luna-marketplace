#!/usr/bin/env node
/**
 * PreToolUse Hook (Read|Write|Edit|Bash): block access to secret files.
 *
 * Blocks reads/writes/edits of .env / .env.*, *.key, *.pem, *.p12, *.pfx,
 * service-account / firebase-admin JSON, AWS/terraform state, credentials,
 * cookies.txt — and Bash commands that cat/less/etc. those same files.
 *
 * Security guard — fail-CLOSED (exit 2 blocks). Adapted from flynance
 * secret_guard.sh, reimplemented in node for portability + testability.
 *
 * Opt-out: LUNA_SECRET_GUARD=off (use sparingly; document why).
 *
 * Exit codes: 0 = allow · 2 = block (stderr fed back to Claude).
 */

'use strict';

const MAX_STDIN = 1024 * 1024;

// File-path patterns that name a secret artifact.
const SECRET_PATH = new RegExp(
  [
    '(^|/)\\.env$',
    '(^|/)\\.env\\.',
    '\\.key$',
    '\\.pem$',
    '\\.p12$',
    '\\.pfx$',
    'serviceAccount.*\\.json$',
    'firebase-adminsdk.*\\.json$',
    'terraform\\.tfstate(\\.backup)?$',
    '(^|/)credentials$',
    '(^|/)cookies\\.txt$',
  ].join('|')
);

// Bash commands that try to read the same files.
const SECRET_BASH = new RegExp(
  [
    '(cat|less|more|head|tail|bat|xxd|strings|nl)\\s+[^|]*\\.env',
    'echo\\s.*>\\s*\\.env',
    '(cat|less|more|head|tail|bat)\\s.*serviceAccount.*\\.json',
    '(cat|less|more|head|tail|bat)\\s.*firebase-adminsdk.*\\.json',
    '(cat|less|more|head|tail|bat)\\s.*terraform\\.tfstate',
    '(cat|less|more|head|tail|bat)\\s.*\\.(key|pem|p12|pfx)\\b',
  ].join('|')
);

function extractField(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed.startsWith('{')) return { path: trimmed, command: '' };
  try {
    const parsed = JSON.parse(trimmed);
    const ti = (parsed && typeof parsed.tool_input === 'object' && parsed.tool_input) || {};
    return {
      path: typeof ti.file_path === 'string' ? ti.file_path : (typeof ti.path === 'string' ? ti.path : ''),
      command: typeof ti.command === 'string' ? ti.command : '',
    };
  } catch {
    return { path: '', command: trimmed };
  }
}

function check(field) {
  if (field.path && SECRET_PATH.test(field.path)) {
    return { blocked: true, reason: `BLOCKED: secret file access denied: ${field.path}\nUse a .env.example template with empty values. Secret material is never read or written via the agent.` };
  }
  if (field.command && (SECRET_PATH.test(field.command) && SECRET_BASH.test(field.command))) {
    return { blocked: true, reason: `BLOCKED: command targets a secret file: ${field.command}` };
  }
  if (field.command && SECRET_BASH.test(field.command)) {
    return { blocked: true, reason: `BLOCKED: command targets a secret file: ${field.command}` };
  }
  return { blocked: false };
}

function run(rawInput) {
  if ((process.env.LUNA_SECRET_GUARD || 'on').trim().toLowerCase() === 'off') {
    return { exitCode: 0 };
  }
  const result = check(extractField(rawInput));
  return result.blocked ? { exitCode: 2, stderr: result.reason } : { exitCode: 0 };
}

module.exports = { run };

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    const r = run(raw);
    if (r.exitCode === 2) {
      process.stderr.write(r.stderr + '\n');
      process.exit(2);
    }
    process.exit(0);
  });
}
