#!/usr/bin/env node
/**
 * PreToolUse Hook (WebFetch|Bash): enforce HTTPS + trusted-source lists.
 *
 *   1. SCHEME   — http:// (and any non-https) is blocked; use HTTPS or escalate.
 *   2. DENYLIST — hosts in web-denylist.txt are hard-blocked.
 *   3. ALLOWLIST— if web-allowlist.txt is non-empty, host must match it.
 *                 (empty/missing allowlist → only http + denylist enforced,
 *                  so the guard never over-blocks by default.)
 *
 * Applies to WebFetch (tool_input.url) and to Bash curl/wget URLs.
 * Security guard — fail-CLOSED (exit 2) on a real violation, but fail-OPEN
 * (exit 0) on any parse error so it never breaks a run.
 *
 * Opt-out: LUNA_WEB_GUARD=off. Adapted from flynance web_source_guard.py.
 *
 * Host matching is suffix-based: "irs.gov" matches "www.irs.gov" but NOT
 * "irs.gov.evil.com".
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_STDIN = 1024 * 1024;
const HERE = __dirname;
const ALLOWLIST_FILE = path.join(HERE, 'web-allowlist.txt');
const DENYLIST_FILE = path.join(HERE, 'web-denylist.txt');

function loadPatterns(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map(l => l.split('#', 1)[0].trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hostMatches(host, patterns) {
  host = (host || '').toLowerCase();
  return patterns.some(p => host === p || host.endsWith('.' + p));
}

// Pull a URL out of WebFetch input or a curl/wget Bash command.
function extractUrl(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed.startsWith('{')) return urlFromCommand(trimmed);
  try {
    const parsed = JSON.parse(trimmed);
    const ti = (parsed && typeof parsed.tool_input === 'object' && parsed.tool_input) || {};
    if (typeof ti.url === 'string' && ti.url.trim()) return ti.url.trim();
    if (typeof ti.command === 'string') return urlFromCommand(ti.command);
    return '';
  } catch {
    return '';
  }
}

function urlFromCommand(cmd) {
  if (!/\b(curl|wget|http|https)\b/.test(cmd || '')) return '';
  const m = (cmd || '').match(/https?:\/\/[^\s"'`)|>]+/);
  return m ? m[0] : '';
}

function parseUrl(url) {
  try {
    const u = new URL(url);
    return { scheme: (u.protocol || '').replace(':', '').toLowerCase(), host: (u.hostname || '').toLowerCase() };
  } catch {
    return { scheme: '', host: '' };
  }
}

function check(url) {
  if (!url) return { blocked: false };
  const { scheme, host } = parseUrl(url);
  if (!scheme || !host) return { blocked: false }; // malformed — let the tool reject

  if (scheme === 'http') {
    return { blocked: true, reason: `BLOCKED: insecure HTTP URL: ${url}\nUse HTTPS. If the source genuinely has no HTTPS endpoint, escalate to the user rather than silently demoting transport security.` };
  }
  if (scheme !== 'https') {
    return { blocked: true, reason: `BLOCKED: non-HTTPS scheme '${scheme}' for ${url}` };
  }
  if (hostMatches(host, loadPatterns(DENYLIST_FILE))) {
    return { blocked: true, reason: `BLOCKED: ${host} is on the project denylist (scripts/hooks/web-denylist.txt).` };
  }
  const allow = loadPatterns(ALLOWLIST_FILE);
  if (allow.length && !hostMatches(host, allow)) {
    return { blocked: true, reason: `BLOCKED: ${host} is not on the trusted-source allowlist (scripts/hooks/web-allowlist.txt). Append the domain there if it is a legitimate primary source, or prefer a trusted source. Emergency bypass: LUNA_WEB_GUARD=off.` };
  }
  return { blocked: false };
}

function run(rawInput) {
  if ((process.env.LUNA_WEB_GUARD || 'on').trim().toLowerCase() === 'off') {
    return { exitCode: 0 };
  }
  const result = check(extractUrl(rawInput));
  return result.blocked ? { exitCode: 2, stderr: result.reason } : { exitCode: 0 };
}

module.exports = { run, check };

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
