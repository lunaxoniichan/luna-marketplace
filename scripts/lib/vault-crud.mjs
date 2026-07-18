/**
 * Studio vault CRUD — authorization, path confinement, FM validation, scoped git commits.
 * See docs/specs/2026-07-18-vault-crud-contract.md
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.mjs';
import { loadRegistry } from './luna-registry.mjs';
import { syncAgentViews } from './agent-views.mjs';
import { writeDocsIndex } from '../build-docs-index.mjs';

export const SCOPE_VALUES = new Set(['user', 'project', 'session']);
export const TYPE_VALUES = new Set([
  'spec',
  'plan',
  'architecture',
  'reference',
  'decision',
  'memory',
  'component',
]);
export const LIFECYCLE_VALUES = new Set(['pre_official', 'official', 'post_official']);
export const STATUS_VALUES = new Set(['draft', 'active', 'done', 'superseded', 'deprecated']);

export const ALLOWED_PREFIXES = [
  'rules/',
  'memory/',
  'docs/decisions/',
  'docs/specs/',
  'docs/plans/',
  'docs/pre-official/',
  'docs/post-official/',
];

const NEVER_BASENAMES = new Set(['lessons.md', 'rules.md', 'luna.mdc']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOCS_INDEX_ARTIFACTS = [
  'docs/generated/docs-index.json',
  'docs/README.md',
  'llms.txt',
];

/** Stamp proving the vault handle came from resolveVaultRoot — module-private (not Symbol.for). */
const VAULT_AUTHORIZED = Symbol('luna.vault.authorized');

/** Exact object identity for handles we issued — blocks in-process forged brands. */
const authorizedVaults = new WeakSet();

function brandVault(info) {
  const vault = { [VAULT_AUTHORIZED]: true, ...info };
  authorizedVaults.add(vault);
  return vault;
}

/**
 * Outer authorization wall: only plugin root or a live registry entry may be a vault.
 * @param {string} pathOrId — registry project id, or absolute/relative path to a vault root
 * @param {{ registry?: { projects?: Array<{ id?: string, path?: string }> }, pluginRoot?: string }} [opts]
 * @returns {{ id: string, root: string, source: 'plugin'|'registry' }}
 */
export function resolveVaultRoot(pathOrId, opts = {}) {
  if (pathOrId == null || String(pathOrId).trim() === '') {
    throw Object.assign(new Error('resolveVaultRoot: pathOrId required'), {
      code: 'VAULT_UNAUTHORIZED',
    });
  }
  const pluginRootRaw = opts.pluginRoot ?? process.env.LUNA_PLUGIN_ROOT ?? null;
  const registry = opts.registry ?? loadRegistry();

  /** @type {Map<string, { id: string, root: string, source: 'plugin'|'registry' }>} */
  const allowed = new Map();

  if (pluginRootRaw) {
    const abs = resolve(pluginRootRaw);
    if (existsSync(abs)) {
      const root = realpathSync(abs);
      allowed.set(root, { id: basename(root), root, source: 'plugin' });
    }
  }

  for (const p of registry.projects || []) {
    if (!p?.path) continue;
    const abs = resolve(String(p.path));
    if (!existsSync(abs)) continue;
    const root = realpathSync(abs);
    const id = String(p.id || basename(root));
  // Registry wins over plugin id collision for the same realpath (same entry).
    allowed.set(root, { id, root, source: 'registry' });
  }

  const key = String(pathOrId).trim();

  for (const info of allowed.values()) {
    if (info.id === key) {
      return brandVault(info);
    }
  }

  try {
    const abs = resolve(key);
    if (existsSync(abs)) {
      const root = realpathSync(abs);
      const info = allowed.get(root);
      if (info) return brandVault(info);
    }
  } catch {
    /* ignore */
  }

  throw Object.assign(
    new Error(
      `resolveVaultRoot: "${key}" is not the plugin root or a live registry project`,
    ),
    { code: 'VAULT_UNAUTHORIZED' },
  );
}

/**
 * @param {object} opts
 * @returns {{ id: string, root: string, source: string }}
 */
export function requireAuthorizedVault(opts) {
  if (opts?.vault && authorizedVaults.has(opts.vault) && opts.vault.root) {
    return opts.vault;
  }
  if (opts?.vaultId != null || opts?.pathOrId != null) {
    return resolveVaultRoot(opts.vaultId ?? opts.pathOrId, {
      registry: opts.registry,
      pluginRoot: opts.pluginRoot,
    });
  }
  throw Object.assign(
    new Error(
      'Unauthorized vault: pass vault from resolveVaultRoot(), or vaultId/pathOrId (raw vaultRoot rejected)',
    ),
    { code: 'VAULT_UNAUTHORIZED' },
  );
}

/**
 * @param {string} vaultRoot
 * @param {string} relPath
 */
export function assertAllowedPath(vaultRoot, relPath) {
  const root = realpathSync(resolve(vaultRoot));
  const norm = String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!norm || norm.includes('\0') || norm.split('/').includes('..')) {
    throw Object.assign(new Error(`Invalid relative path: ${relPath}`), { code: 'PATH_INVALID' });
  }
  const base = norm.split('/').pop()?.toLowerCase() || '';
  if (NEVER_BASENAMES.has(base) || base.endsWith('.local.md') || base.endsWith('.local.mdc')) {
    throw Object.assign(new Error(`Protected basename: ${base}`), { code: 'PATH_PROTECTED' });
  }
  if (
    norm.startsWith('.claude/') ||
    norm.startsWith('.cursor/') ||
    norm.startsWith('docs/generated/')
  ) {
    throw Object.assign(new Error(`Generated / tool tree forbidden: ${norm}`), {
      code: 'PATH_GENERATED',
    });
  }
  const allowed = ALLOWED_PREFIXES.some((p) => norm.startsWith(p));
  if (!allowed) {
    throw Object.assign(new Error(`Path outside writable vault zones: ${norm}`), {
      code: 'PATH_ZONE',
    });
  }
  const abs = resolve(root, norm);
  const absNorm = abs.startsWith(root + sep) || abs === root;
  if (!absNorm) {
    throw Object.assign(new Error(`Path escapes vault root: ${norm}`), { code: 'PATH_ESCAPE' });
  }
  if (existsSync(abs)) {
    const real = realpathSync(abs);
    if (!(real.startsWith(root + sep) || real === root)) {
      throw Object.assign(new Error(`Symlink escapes vault root: ${norm}`), { code: 'PATH_ESCAPE' });
    }
    return { root, relPath: norm, absPath: real };
  }
  let parent = dirname(abs);
  while (!existsSync(parent) && parent !== root && parent.length > root.length) {
    parent = dirname(parent);
  }
  if (existsSync(parent)) {
    const realParent = realpathSync(parent);
    if (!(realParent.startsWith(root + sep) || realParent === root)) {
      throw Object.assign(new Error(`Parent escapes vault root: ${norm}`), { code: 'PATH_ESCAPE' });
    }
  }
  return { root, relPath: norm, absPath: abs };
}

/**
 * @param {Record<string, unknown>} data
 * @param {{ requireFm?: boolean }} [opts]
 */
export function validateFrontmatter(data, opts = {}) {
  const requireFm = opts.requireFm !== false;
  const errors = [];
  if (!data || typeof data !== 'object') {
    if (requireFm) errors.push({ field: '_', message: 'front-matter required', got: data });
    return errors;
  }
  const checks = [
    ['scope', SCOPE_VALUES],
    ['type', TYPE_VALUES],
    ['lifecycle', LIFECYCLE_VALUES],
    ['status', STATUS_VALUES],
  ];
  if (requireFm) {
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
      errors.push({ field: 'title', message: 'non-empty string required', got: data.title });
    }
    for (const [field, allowed] of checks) {
      if (data[field] === undefined) {
        errors.push({ field, message: 'required', got: undefined, allowed: [...allowed] });
      } else if (!allowed.has(String(data[field]))) {
        errors.push({
          field,
          message: 'invalid enum',
          got: data[field],
          allowed: [...allowed],
        });
      }
    }
    if (data.updated !== undefined && !DATE_RE.test(String(data.updated))) {
      errors.push({
        field: 'updated',
        message: 'YYYY-MM-DD required when present',
        got: data.updated,
      });
    }
  } else {
    for (const [field, allowed] of checks) {
      if (data[field] !== undefined && !allowed.has(String(data[field]))) {
        errors.push({
          field,
          message: 'invalid enum',
          got: data[field],
          allowed: [...allowed],
        });
      }
    }
  }
  return errors;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function stampFrontmatter(fm) {
  return { ...fm, updated: today() };
}

function needsFrontmatter(relPath) {
  return !relPath.startsWith('rules/');
}

function needsSync(relPath) {
  return relPath.startsWith('rules/') || relPath.startsWith('memory/');
}

function needsDocsIndex(relPaths) {
  return relPaths.some((p) => p.startsWith('docs/'));
}

function atomicWrite(absPath, contents) {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, absPath);
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * @param {string} root
 * @param {string[]} relPaths
 * @param {string} message
 * @param {string} [planTrailer]
 */
export function commitPaths(root, relPaths, message, planTrailer) {
  const unique = [...new Set(relPaths.map((p) => p.replace(/\\/g, '/')))];
  for (const p of unique) {
    git(root, ['add', '--', p]);
  }
  const msg = planTrailer ? `${message}\n\n${planTrailer}\n` : `${message}\n`;
  const tmpMsg = join(tmpdir(), `luna-vault-crud-${process.pid}-${Date.now()}.msg`);
  writeFileSync(tmpMsg, msg, 'utf8');
  try {
    git(root, ['commit', '-F', tmpMsg, '--', ...unique]);
  } finally {
    try {
      unlinkSync(tmpMsg);
    } catch {
      /* ignore */
    }
  }
  return git(root, ['rev-parse', 'HEAD']);
}

function attachSyncDryRun(root, relPaths) {
  if (!relPaths.some(needsSync)) return undefined;
  return syncAgentViews(root, { dryRun: true });
}

/**
 * Refresh docs-index artifacts; returns relative paths to include in the same commit.
 * @param {string} root
 */
function refreshDocsIndex(root) {
  const result = writeDocsIndex(root);
  return result.artifacts.filter((p) => existsSync(join(root, p)));
}

function catchErr(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return {
      ok: false,
      error: { code: e.code || 'ERROR', message: e.message || String(e) },
    };
  }
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function fileContentSha(absPath) {
  return sha256(readFileSync(absPath, 'utf8'));
}

function commitFnOf(opts) {
  return opts.commitFn || commitPaths;
}

/**
 * @param {object} opts — must include `vault` (from resolveVaultRoot) or `vaultId`/`pathOrId`
 */
export function createFile(opts) {
  const vault = catchErr(() => requireAuthorizedVault(opts));
  if (!vault.ok) return vault;
  const located = catchErr(() => assertAllowedPath(vault.value.root, opts.relPath));
  if (!located.ok) return located;
  const { root, relPath, absPath } = located.value;
  if (existsSync(absPath)) {
    return { ok: false, error: { code: 'EXISTS', message: `Already exists: ${relPath}` } };
  }
  const requireFm = needsFrontmatter(relPath);
  const fm = requireFm ? stampFrontmatter(opts.frontmatter || {}) : opts.frontmatter || {};
  const errs = validateFrontmatter(fm, { requireFm });
  if (errs.length) return { ok: false, error: { code: 'FM_INVALID', errors: errs } };

  const contents = requireFm
    ? serializeFrontmatter(fm, opts.body || '')
    : opts.body?.endsWith('\n')
      ? opts.body
      : `${opts.body || ''}\n`;
  atomicWrite(absPath, contents);

  let extra = [];
  try {
    if (needsDocsIndex([relPath])) extra = refreshDocsIndex(root);
  } catch (e) {
    try {
      unlinkSync(absPath);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      error: { code: 'DOCS_INDEX', message: String(e?.message || e) },
    };
  }

  const touched = [relPath, ...extra];
  let commitSha;
  try {
    commitSha = commitFnOf(opts)(
      root,
      touched,
      `docs(vault): create ${relPath}`,
      opts.planTrailer,
    );
  } catch (e) {
    try {
      unlinkSync(absPath);
    } catch {
      /* ignore */
    }
    if (extra.length) {
      try {
        refreshDocsIndex(root);
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      error: { code: 'GIT_COMMIT', message: String(e?.stderr || e.message || e) },
      note: 'create rolled back (new file unlinked)',
    };
  }
  return {
    ok: true,
    absPath,
    relPath,
    commitSha,
    syncDryRun: attachSyncDryRun(root, [relPath]),
    indexRefreshed: extra.length > 0,
  };
}

/**
 * @param {object} opts
 */
export function updateFile(opts) {
  const vault = catchErr(() => requireAuthorizedVault(opts));
  if (!vault.ok) return vault;
  const located = catchErr(() => assertAllowedPath(vault.value.root, opts.relPath));
  if (!located.ok) return located;
  const { root, relPath, absPath } = located.value;
  if (!existsSync(absPath)) {
    return { ok: false, error: { code: 'MISSING', message: `Not found: ${relPath}` } };
  }
  const previous = readFileSync(absPath, 'utf8');
  const requireFm = needsFrontmatter(relPath);
  const fm = requireFm ? stampFrontmatter(opts.frontmatter || {}) : opts.frontmatter || {};
  const errs = validateFrontmatter(fm, { requireFm });
  if (errs.length) return { ok: false, error: { code: 'FM_INVALID', errors: errs } };

  const contents = requireFm
    ? serializeFrontmatter(fm, opts.body || '')
    : opts.body?.endsWith('\n')
      ? opts.body
      : `${opts.body || ''}\n`;
  atomicWrite(absPath, contents);

  let extra = [];
  try {
    if (needsDocsIndex([relPath])) extra = refreshDocsIndex(root);
  } catch (e) {
    writeFileSync(absPath, previous, 'utf8');
    return {
      ok: false,
      error: { code: 'DOCS_INDEX', message: String(e?.message || e) },
    };
  }

  const touched = [relPath, ...extra];
  let commitSha;
  try {
    commitSha = commitFnOf(opts)(
      root,
      touched,
      `docs(vault): update ${relPath}`,
      opts.planTrailer,
    );
  } catch (e) {
    writeFileSync(absPath, previous, 'utf8');
    if (extra.length) {
      try {
        refreshDocsIndex(root);
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      error: { code: 'GIT_COMMIT', message: String(e?.stderr || e.message || e) },
      note: 'update rolled back to previous file bytes',
    };
  }
  return {
    ok: true,
    absPath,
    relPath,
    commitSha,
    syncDryRun: attachSyncDryRun(root, [relPath]),
    indexRefreshed: extra.length > 0,
  };
}

/**
 * Delete requires confirmPath (path echo) + confirmSha (sha256 of current bytes).
 * confirmPath alone is not a preview gate — confirmSha proves the caller hashed current content.
 * @param {object} opts
 */
export function deleteFile(opts) {
  const vault = catchErr(() => requireAuthorizedVault(opts));
  if (!vault.ok) return vault;
  const located = catchErr(() => assertAllowedPath(vault.value.root, opts.relPath));
  if (!located.ok) return located;
  const { root, relPath, absPath } = located.value;
  const confirm = String(opts.confirmPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (confirm !== relPath) {
    return {
      ok: false,
      error: {
        code: 'CONFIRM_REQUIRED',
        message: `confirmPath must equal relPath (got ${JSON.stringify(confirm)})`,
      },
    };
  }
  if (!existsSync(absPath)) {
    return { ok: false, error: { code: 'MISSING', message: `Not found: ${relPath}` } };
  }
  const previous = readFileSync(absPath, 'utf8');
  const currentSha = sha256(previous);
  if (!opts.confirmSha || opts.confirmSha !== currentSha) {
    return {
      ok: false,
      error: {
        code: 'CONFIRM_SHA',
        message: 'confirmSha must equal sha256 of current file contents (proves caller saw current bytes)',
        expectedHint: currentSha.slice(0, 12) + '…',
      },
    };
  }

  const { data } = parseFrontmatter(previous);
  const warnings = [];
  if (data.status === 'active') warnings.push('deleting active doc');

  unlinkSync(absPath);

  let extra = [];
  try {
    if (needsDocsIndex([relPath])) extra = refreshDocsIndex(root);
  } catch (e) {
    writeFileSync(absPath, previous, 'utf8');
    return {
      ok: false,
      error: { code: 'DOCS_INDEX', message: String(e?.message || e) },
      warnings,
    };
  }

  const touched = [relPath, ...extra];
  let commitSha;
  try {
    commitSha = commitFnOf(opts)(
      root,
      touched,
      `docs(vault): delete ${relPath}`,
      opts.planTrailer,
    );
  } catch (e) {
    writeFileSync(absPath, previous, 'utf8');
    if (extra.length) {
      try {
        refreshDocsIndex(root);
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      error: { code: 'GIT_COMMIT', message: String(e?.stderr || e.message || e) },
      note: 'delete rolled back (file restored)',
      warnings,
    };
  }
  return {
    ok: true,
    absPath,
    relPath,
    commitSha,
    warnings,
    syncDryRun: attachSyncDryRun(root, [relPath]),
    indexRefreshed: extra.length > 0,
  };
}

/**
 * @param {object} opts
 * @param {string[]} opts.sources
 * @param {string} opts.target
 * @param {string[]} opts.confirmSources
 * @param {Record<string, string>} opts.confirmShas — path → sha256 of each source's current bytes
 */
export function mergeFiles(opts) {
  const vault = catchErr(() => requireAuthorizedVault(opts));
  if (!vault.ok) return vault;
  const sources = (opts.sources || []).map((p) => p.replace(/\\/g, '/'));
  const target = String(opts.target || '').replace(/\\/g, '/');
  const confirm = (opts.confirmSources || []).map((p) => p.replace(/\\/g, '/')).sort();
  const srcSorted = [...sources].sort();
  if (confirm.join('\0') !== srcSorted.join('\0')) {
    return {
      ok: false,
      error: { code: 'CONFIRM_REQUIRED', message: 'confirmSources must match sources' },
    };
  }

  /** @type {Array<{ rel: string, abs: string, bytes: string }>} */
  const sourceSnaps = [];
  for (const s of sources) {
    if (!(s.startsWith('memory/') || s.startsWith('docs/'))) {
      return { ok: false, error: { code: 'PATH_ZONE', message: `merge source not memory/docs: ${s}` } };
    }
    const loc = catchErr(() => assertAllowedPath(vault.value.root, s));
    if (!loc.ok) return loc;
    if (!existsSync(loc.value.absPath)) {
      return { ok: false, error: { code: 'MISSING', message: `Not found: ${s}` } };
    }
    const bytes = readFileSync(loc.value.absPath, 'utf8');
    const expect = opts.confirmShas?.[s];
    const got = sha256(bytes);
    if (!expect || expect !== got) {
      return {
        ok: false,
        error: {
          code: 'CONFIRM_SHA',
          message: `confirmShas[${s}] must equal sha256 of current contents`,
        },
      };
    }
    sourceSnaps.push({ rel: s, abs: loc.value.absPath, bytes });
  }

  if (!(target.startsWith('memory/') || target.startsWith('docs/'))) {
    return { ok: false, error: { code: 'PATH_ZONE', message: `merge target not memory/docs: ${target}` } };
  }
  const located = catchErr(() => assertAllowedPath(vault.value.root, target));
  if (!located.ok) return located;
  const { root, relPath: targetRel, absPath: targetAbs } = located.value;

  const fm = stampFrontmatter(opts.frontmatter || {});
  const errs = validateFrontmatter(fm, { requireFm: true });
  if (errs.length) return { ok: false, error: { code: 'FM_INVALID', errors: errs } };

  const targetExisted = existsSync(targetAbs);
  const targetPrevious = targetExisted ? readFileSync(targetAbs, 'utf8') : null;
  const contents = serializeFrontmatter(fm, opts.body || '');

  function rollbackMerge(deletedRels) {
    if (targetExisted && targetPrevious != null) {
      writeFileSync(targetAbs, targetPrevious, 'utf8');
    } else if (existsSync(targetAbs)) {
      try {
        unlinkSync(targetAbs);
      } catch {
        /* ignore */
      }
    }
    for (const snap of sourceSnaps) {
      if (deletedRels.has(snap.rel) || !existsSync(snap.abs)) {
        atomicWrite(snap.abs, snap.bytes);
      }
    }
  }

  atomicWrite(targetAbs, contents);
  const deleted = [];
  const deletedSet = new Set();
  for (const snap of sourceSnaps) {
    if (snap.rel === targetRel) continue;
    if (existsSync(snap.abs)) {
      unlinkSync(snap.abs);
      deleted.push(snap.rel);
      deletedSet.add(snap.rel);
    }
  }

  const primaryTouched = [targetRel, ...deleted];
  let extra = [];
  try {
    if (needsDocsIndex(primaryTouched)) extra = refreshDocsIndex(root);
  } catch (e) {
    rollbackMerge(deletedSet);
    return {
      ok: false,
      error: { code: 'DOCS_INDEX', message: String(e?.message || e) },
    };
  }

  const touched = [...primaryTouched, ...extra];
  let commitSha;
  try {
    commitSha = commitFnOf(opts)(
      root,
      touched,
      `docs(vault): merge ${sources.join(', ')} → ${targetRel}`,
      opts.planTrailer,
    );
  } catch (e) {
    rollbackMerge(deletedSet);
    if (extra.length) {
      try {
        refreshDocsIndex(root);
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      error: { code: 'GIT_COMMIT', message: String(e?.stderr || e.message || e) },
      note: 'merge rolled back (target + sources restored)',
    };
  }
  return {
    ok: true,
    absPath: targetAbs,
    relPath: targetRel,
    deleted,
    commitSha,
    syncDryRun: attachSyncDryRun(root, primaryTouched),
    indexRefreshed: extra.length > 0,
  };
}

/**
 * @param {object} vaultOrRoot — authorized vault handle, or legacy string only for read helpers after resolve
 */
export function listWikilinkTargets(vaultOrRoot) {
  const root =
    typeof vaultOrRoot === 'string'
      ? vaultOrRoot
      : vaultOrRoot?.root;
  if (!root) return [];
  const indexPath = join(root, 'docs/generated/docs-index.json');
  if (!existsSync(indexPath)) return [];
  try {
    const idx = JSON.parse(readFileSync(indexPath, 'utf8'));
    const docs = idx.documents || idx.docs || [];
    return docs
      .map((d) => ({
        slug: d.slug || d.id || '',
        path: d.path || d.relPath || '',
        title: d.title || '',
      }))
      .filter((d) => d.slug || d.path);
  } catch {
    return [];
  }
}

/** Apply previously previewed sync (separate from CRUD). Requires authorized vault. */
export function applyAgentViewSync(opts) {
  const vault = requireAuthorizedVault(typeof opts === 'string' ? { pathOrId: opts } : opts);
  return syncAgentViews(vault.root, { dryRun: false });
}

export function relativeUnder(root, abs) {
  return relative(root, abs).replace(/\\/g, '/');
}

export { DOCS_INDEX_ARTIFACTS };
