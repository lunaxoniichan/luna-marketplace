/**
 * Walk markdown files under a root, skipping heavy/irrelevant dirs.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const SKIP = new Set([
  'node_modules',
  '.git',
  '.gitnexus',
  'dist',
  'build',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  'fork',
  'volume',
  '.luna-cache',
  'vendor',
]);

/**
 * @param {string} root
 * @param {{ under?: string, maxFiles?: number }} [opts]
 * @returns {Array<{ abs: string, rel: string, lines: number, text: string }>}
 */
export function walkMarkdown(root, opts = {}) {
  const start = opts.under ? join(root, opts.under) : root;
  if (!existsSync(start)) return [];
  const out = [];
  const max = opts.maxFiles ?? 5000;

  function walk(dir) {
    if (out.length >= max) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (out.length >= max) return;
      if (ent.name.startsWith('.') && ent.name !== '.claude') continue;
      if (SKIP.has(ent.name)) continue;
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!ent.isFile()) continue;
      if (extname(ent.name).toLowerCase() !== '.md') continue;
      let text;
      let lines;
      try {
        text = readFileSync(abs, 'utf8');
        lines = text.split(/\r?\n/).length;
      } catch {
        continue;
      }
      out.push({ abs, rel: relative(root, abs).replace(/\\/g, '/'), lines, text });
    }
  }

  const st = statSync(start);
  if (st.isFile()) {
    if (extname(start).toLowerCase() === '.md') {
      const text = readFileSync(start, 'utf8');
      out.push({
        abs: start,
        rel: relative(root, start).replace(/\\/g, '/'),
        lines: text.split(/\r?\n/).length,
        text,
      });
    }
    return out;
  }
  walk(start);
  return out;
}

export function countLines(text) {
  return text.split(/\r?\n/).length;
}
