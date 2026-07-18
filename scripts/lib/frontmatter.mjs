/**
 * Minimal YAML front-matter helpers for Luna docs/memory/decisions.
 * Supports scalars, inline arrays, and nested maps one level deep (no full YAML dep).
 */

const FM_OPEN = /^---\r?\n/;

/**
 * @param {string} text
 * @returns {{ data: Record<string, unknown>, body: string, hasFm: boolean, raw: string }}
 */
export function parseFrontmatter(text) {
  if (!FM_OPEN.test(text)) {
    return { data: {}, body: text, hasFm: false, raw: '' };
  }
  const afterOpen = text.replace(FM_OPEN, '');
  const end = afterOpen.search(/\r?\n---\r?\n/);
  if (end === -1) {
    // tolerate EOF closer
    const endEof = afterOpen.search(/\r?\n---\s*$/);
    if (endEof === -1) return { data: {}, body: text, hasFm: false, raw: '' };
    const raw = afterOpen.slice(0, endEof);
    return { data: parseSimpleYaml(raw), body: '', hasFm: true, raw };
  }
  const raw = afterOpen.slice(0, end);
  const rest = afterOpen.slice(end).replace(/^\r?\n---\r?\n/, '');
  return { data: parseSimpleYaml(raw), body: rest, hasFm: true, raw };
}

/**
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
export function parseSimpleYaml(raw) {
  const data = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    // nested list under key (e.g. suggested_skills: then - item)
    const keyOnly = line.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (keyOnly) {
      const key = keyOnly[1];
      const items = [];
      i++;
      while (i < lines.length) {
        const m = lines[i].match(/^\s+-\s+(.+)$/);
        if (!m) break;
        items.push(unquote(m[1].trim()));
        i++;
      }
      // nested map block: "  foo: bar"
      if (items.length === 0) {
        const obj = {};
        let saw = false;
        while (i < lines.length) {
          const nm = lines[i].match(/^\s{2,}([A-Za-z0-9_-]+):\s*(.*)$/);
          if (!nm) break;
          saw = true;
          obj[nm[1]] = parseScalar(nm[2].trim());
          i++;
        }
        data[key] = saw ? obj : [];
      } else {
        data[key] = items;
      }
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      data[kv[1]] = parseScalar(kv[2].trim());
    }
    i++;
  }
  return data;
}

/**
 * @param {string} v
 * @returns {unknown}
 */
function parseScalar(v) {
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((s) => unquote(s.trim()));
  }
  return unquote(v);
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Serialize a flat-ish front-matter object + body.
 * @param {Record<string, unknown>} data
 * @param {string} body
 */
export function serializeFrontmatter(data, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map(formatScalar).join(', ')}]`);
    } else if (v !== null && typeof v === 'object') {
      lines.push(`${k}:`);
      for (const [ik, iv] of Object.entries(v)) {
        lines.push(`  ${ik}: ${formatScalar(iv)}`);
      }
    } else {
      lines.push(`${k}: ${formatScalar(v)}`);
    }
  }
  lines.push('---');
  const b = body.startsWith('\n') ? body : `\n${body}`;
  return lines.join('\n') + (b.endsWith('\n') ? b : `${b}\n`);
}

function formatScalar(v) {
  if (typeof v === 'boolean' || typeof v === 'number' || v === null) return String(v);
  const s = String(v);
  if (/[:#\[\]{},]|^\s|\s$/.test(s)) return JSON.stringify(s);
  return s;
}

/** Infer lifecycle from path when front-matter is absent. */
export function inferLifecycle(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p.includes('/pre-official/') || p.startsWith('docs/pre-official/')) return 'pre_official';
  if (p.includes('/post-official/') || p.startsWith('docs/post-official/')) return 'post_official';
  return 'official';
}

/** Infer type from path / filename heuristics. */
export function inferType(relPath) {
  const p = relPath.replace(/\\/g, '/').toLowerCase();
  if (p.includes('/plans/') || p.endsWith('plans.md')) return 'plan';
  if (p.includes('/specs/')) return 'spec';
  if (p.includes('/decisions/') || /\/adr[-_]/.test(p)) return 'decision';
  if (p.includes('/memory/') || p.includes('memory.md')) return 'memory';
  if (p.includes('system_design') || p.includes('project_structures') || p.includes('database_design')) {
    return 'architecture';
  }
  if (p.includes('/pre-official/research/') || p.includes('/pre-official/audits/')) return 'spec';
  return 'reference';
}

/**
 * Extract [[wikilink]] targets from markdown body.
 * @param {string} body
 * @returns {string[]}
 */
export function extractWikilinks(body) {
  const out = [];
  const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push(m[1].trim());
  }
  return [...new Set(out)];
}
