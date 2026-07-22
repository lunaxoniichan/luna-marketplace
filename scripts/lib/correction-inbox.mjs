/**
 * Correction / lesson inbox — Phase 4.3 (S2).
 * Contract: docs/specs/2026-07-20-context-pack-contract.md §D5.
 *
 * READ-ONLY candidate discovery + a human accept/reject step. The ONLY durable
 * write is accept → appendLesson (lessons.md + lessons.mdc). Never writes memory/*.md,
 * native ~/.claude memory, or generated rule views; never routes through vault-crud.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveVaultRoot } from './vault-crud.mjs';
import {
  appendLesson,
  isDuplicateLesson,
  keywordSet,
  LESSON_MD_REL,
} from './lessons-append.mjs';

function sha12(s) {
  return createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 12);
}

/**
 * Native pending-feedback path for a vault (agent-owned; read-only source).
 * Mirrors approach-correction.py PROJECT_SLUG derivation.
 * @param {string} vaultRoot
 */
export function nativePendingFile(vaultRoot) {
  const slug = '-' + String(vaultRoot).replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
  return join(homedir(), '.claude', 'projects', slug, 'memory', '.pending-feedback.md');
}

/**
 * Parse `.pending-feedback.md` blocks (written by the lessons-extractor hook).
 * @param {string} text
 */
export function parsePendingFeedback(text) {
  const blocks = [];
  let cur = null;
  for (const raw of String(text || '').split('\n')) {
    if (raw.startsWith('## ')) {
      if (cur) blocks.push(cur);
      cur = { date: raw.slice(3).trim(), what_claude_did: '', what_user_said: '', implied_preference: '' };
      continue;
    }
    if (!cur) continue;
    const m = raw.match(/^-\s*\*\*(.+?):\*\*\s*(.*)$/);
    if (!m) continue;
    const label = m[1].toLowerCase();
    const val = m[2].trim();
    if (label.includes('what claude did')) cur.what_claude_did = val;
    else if (label.includes('what user said')) cur.what_user_said = val;
    else if (label.includes('implied preference')) cur.implied_preference = val;
  }
  if (cur) blocks.push(cur);
  return blocks.filter((b) => b.what_claude_did || b.implied_preference);
}

/**
 * List correction candidates for review. READ-ONLY — writes nothing.
 * @param {{ vaultId: string, pluginRoot?: string, registry?: object, pendingFile?: string }} opts
 */
export function listCorrectionCandidates(opts) {
  const vaultId = String(opts.vaultId || '');
  if (!vaultId) {
    const err = new Error('vaultId required');
    err.code = 'VAULT_ID';
    throw err;
  }
  const vault = resolveVaultRoot(vaultId, { pluginRoot: opts.pluginRoot, registry: opts.registry });

  const lessonsAbs = join(vault.root, LESSON_MD_REL);
  const existingLessons = existsSync(lessonsAbs) ? readFileSync(lessonsAbs, 'utf8') : '';

  const pendingPath = opts.pendingFile || nativePendingFile(vault.root);
  let pending = [];
  try {
    if (existsSync(pendingPath)) pending = parsePendingFeedback(readFileSync(pendingPath, 'utf8'));
  } catch {
    pending = [];
  }

  const candidates = pending.map((p) => {
    const key = keywordSet(`${p.what_claude_did} ${p.implied_preference}`);
    return {
      candidate_id: sha12(`${p.what_claude_did}|${p.implied_preference}`),
      what_claude_did: p.what_claude_did,
      what_user_said: p.what_user_said,
      implied_preference: p.implied_preference,
      date: p.date,
      source: 'pending-feedback',
      // true if an existing lesson already covers this (accept would dedup)
      duplicate: isDuplicateLesson(existingLessons, key),
    };
  });

  return {
    ok: true,
    vaultId: vault.id,
    candidates,
    sources: {
      pending_file: pendingPath,
      pending_count: pending.length,
      lessons_present: existsSync(lessonsAbs),
    },
  };
}

/**
 * Accept a candidate → append one lesson line to lessons.md + lessons.mdc ONLY.
 * Structured fields only (the formatter owns the persisted line — no free-text prose).
 * @param {{ vaultId: string, candidateId?: string, what_claude_did: string,
 *           implied_preference: string, applies_to?: 'this_project'|'all_projects',
 *           pluginRoot?: string, registry?: object, date?: string }} opts
 */
export function acceptCorrection(opts) {
  const vaultId = String(opts.vaultId || '');
  if (!vaultId) {
    const err = new Error('vaultId required');
    err.code = 'VAULT_ID';
    throw err;
  }
  const what = String(opts.what_claude_did || '').trim();
  const preference = String(opts.implied_preference || '').trim();
  if (!what || !preference) {
    const err = new Error('what_claude_did and implied_preference are required');
    err.code = 'LESSON_FIELDS';
    throw err;
  }
  const vault = resolveVaultRoot(vaultId, { pluginRoot: opts.pluginRoot, registry: opts.registry });
  const res = appendLesson({
    vaultRoot: vault.root,
    what,
    preference,
    portable: opts.applies_to === 'all_projects',
    date: opts.date,
  });
  return {
    ok: true,
    vaultId: vault.id,
    candidateId: opts.candidateId,
    appended: res.appended,
    deduped: res.deduped,
    line: res.line,
    targets: res.targets,
  };
}

/**
 * Reject a candidate — no durable write. Resolves the vault for wall parity only.
 * @param {{ vaultId: string, candidateId?: string, pluginRoot?: string, registry?: object }} opts
 */
export function rejectCorrection(opts) {
  const vaultId = String(opts.vaultId || '');
  if (!vaultId) {
    const err = new Error('vaultId required');
    err.code = 'VAULT_ID';
    throw err;
  }
  const vault = resolveVaultRoot(vaultId, { pluginRoot: opts.pluginRoot, registry: opts.registry });
  return { ok: true, vaultId: vault.id, candidateId: opts.candidateId, appended: false, rejected: true };
}
