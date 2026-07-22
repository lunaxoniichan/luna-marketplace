/**
 * Lessons append helper — the SOLE Node writer of lessons.md / lessons.mdc.
 * Contract: docs/specs/2026-07-20-context-pack-contract.md §D5 (option b).
 *
 * Format + dedup parity with scripts/lib/approach-correction.py::append_lesson_line
 * (the hook-side Python writer). Both must produce byte-identical lesson lines so the
 * correction inbox and the lessons-extractor hook never diverge (T13-adjacent).
 *
 * Append-only. Writes BOTH `.claude/rules/lessons.md` and `.cursor/rules/lessons.mdc`
 * in lockstep (never one without the other — silent Claude↔Cursor desync is rejected).
 * Never routes through vault-crud (lessons.md is a PROTECTED basename → PATH_PROTECTED);
 * never writes memory/*.md or native ~/.claude memory.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { today } from './util.mjs';

export const LESSON_MD_REL = join('.claude', 'rules', 'lessons.md');
export const LESSON_MDC_REL = join('.cursor', 'rules', 'lessons.mdc');
export const DEDUP_OVERLAP = 0.7;

// Stopword set — mirror of approach-correction.py::keyword_set.
const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'is', 'are', 'be', 'with',
  'as', 'by', 'at', 'this', 'that', 'use', 'do', 'not', 'no', 'must', 'should', 'always', 'never',
]);

/**
 * Keyword set — parity with approach-correction.py::keyword_set.
 * @param {string} text
 * @returns {Set<string>}
 */
export function keywordSet(text) {
  const cleaned = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const out = new Set();
  for (const w of cleaned.split(/\s+/)) {
    if (w.length > 2 && !STOP.has(w)) out.add(w);
  }
  return out;
}

/**
 * Produce the canonical lesson line (parity with the Python writer).
 * @param {{ what: string, preference: string, portable?: boolean, date?: string }} c
 * @returns {string} line WITHOUT trailing newline
 */
export function formatLessonLine({ what, preference, portable = false, date }) {
  const did = String(what || '').trim().replace(/\.+$/, '');
  const pref = String(preference || '').trim().replace(/\.+$/, '');
  if (!did || !pref) {
    const err = new Error('lesson requires both what and preference');
    err.code = 'LESSON_FIELDS';
    throw err;
  }
  const prefix = portable ? '[portable] ' : '';
  return `- ${prefix}AVOID ${did} — DO ${pref} (${date || today()})`;
}

/** Match an existing lesson bullet, portable or not. */
function isLessonBullet(line) {
  return /^- (\[portable\] )?AVOID /.test(line);
}

/**
 * True if `existing` already contains a lesson whose keywords overlap the new key
 * by >= DEDUP_OVERLAP (parity with the Python crude-dedupe).
 * @param {string} existing full file text
 * @param {Set<string>} key keyword set of the new lesson
 */
export function isDuplicateLesson(existing, key) {
  if (key.size === 0) return false;
  for (const line of String(existing || '').split('\n')) {
    if (!isLessonBullet(line)) continue;
    const other = keywordSet(line);
    let shared = 0;
    for (const k of key) if (other.has(k)) shared++;
    if (shared / key.size >= DEDUP_OVERLAP) return true;
  }
  return false;
}

function appendToFile(abs, line) {
  mkdirSync(dirname(abs), { recursive: true });
  let existing = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
  if (existing && !existing.endsWith('\n')) existing += '\n';
  writeFileSync(abs, existing + line + '\n', 'utf8');
}

/**
 * Append one lesson line to BOTH lesson files under vaultRoot, in lockstep.
 * Dedup is decided against the primary (.claude) file; on dup, BOTH are skipped.
 *
 * @param {{ vaultRoot: string, what: string, preference: string,
 *           portable?: boolean, date?: string }} opts
 * @returns {{ appended: boolean, deduped: boolean, line: string,
 *             targets: string[] }}
 */
export function appendLesson(opts) {
  const vaultRoot = String(opts.vaultRoot || '');
  if (!vaultRoot) {
    const err = new Error('vaultRoot required');
    err.code = 'VAULT_ROOT';
    throw err;
  }
  const line = formatLessonLine(opts);
  const key = keywordSet(`${opts.what} ${opts.preference}`);

  const mdAbs = join(vaultRoot, LESSON_MD_REL);
  const mdcAbs = join(vaultRoot, LESSON_MDC_REL);

  const primary = existsSync(mdAbs) ? readFileSync(mdAbs, 'utf8') : '';
  if (isDuplicateLesson(primary, key)) {
    return { appended: false, deduped: true, line, targets: [] };
  }

  // Lockstep: write both — never .md without .mdc.
  appendToFile(mdAbs, line);
  appendToFile(mdcAbs, line);
  return {
    appended: true,
    deduped: false,
    line,
    targets: [LESSON_MD_REL, LESSON_MDC_REL],
  };
}
