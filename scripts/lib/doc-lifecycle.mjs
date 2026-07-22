/**
 * Doc lifecycle promote / demote / supersede.
 * Contract: docs/specs/2026-07-19-doc-lifecycle-promote-demote-contract.md
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.mjs';
import {
  assertAllowedPath,
  requireAuthorizedVault,
  sha256,
  validateFrontmatter,
} from './vault-crud.mjs';
import { writeDocsIndex } from '../build-docs-index.mjs';
import { today } from './util.mjs';

export const LIFECYCLE_COMMIT_PREFIX = 'docs(lifecycle):';

export const OPS = new Set(['promote', 'demote', 'supersede']);

/** Single source of truth — contract §3 */
export const LIFECYCLE_FOLDER_MAP = {
  pre_official: {
    default: 'docs/pre-official/research',
    audits: 'docs/pre-official/audits',
  },
  official: {
    spec: 'docs/specs',
    plan: 'docs/plans',
    decision: 'docs/decisions',
    default: 'docs/specs',
  },
  post_official: {
    plan: 'docs/post-official/completed-plans',
    default: 'docs/post-official/legacy',
  },
};

const DOCS_INDEX_ARTIFACTS = [
  'docs/generated/docs-index.json',
  'docs/README.md',
  'llms.txt',
];


function normPath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function isMemoryPath(relPath) {
  return normPath(relPath).startsWith('memory/');
}

function isRulesPath(relPath) {
  return normPath(relPath).startsWith('rules/');
}

function isDocsPath(relPath) {
  return normPath(relPath).startsWith('docs/');
}

/**
 * @param {string} relPath
 * @param {{ lifecycle: string, type: string, destSubdir?: string }} opts
 */
export function deriveDest(relPath, opts) {
  const src = normPath(relPath);
  const base = basename(src);
  if (isMemoryPath(src)) return src;
  if (isRulesPath(src)) {
    throw Object.assign(new Error('rules/ is not a lifecycle surface'), {
      code: 'LIFECYCLE_SURFACE',
    });
  }
  const { lifecycle, type } = opts;
  let dir;
  if (lifecycle === 'pre_official') {
    dir =
      opts.destSubdir === 'audits'
        ? LIFECYCLE_FOLDER_MAP.pre_official.audits
        : LIFECYCLE_FOLDER_MAP.pre_official.default;
  } else if (lifecycle === 'official') {
    dir = LIFECYCLE_FOLDER_MAP.official[type] || LIFECYCLE_FOLDER_MAP.official.default;
  } else if (lifecycle === 'post_official') {
    dir =
      type === 'plan'
        ? LIFECYCLE_FOLDER_MAP.post_official.plan
        : LIFECYCLE_FOLDER_MAP.post_official.default;
  } else {
    throw Object.assign(new Error(`Unknown lifecycle: ${lifecycle}`), {
      code: 'FM_INVALID',
    });
  }
  return `${dir}/${base}`;
}

/**
 * Expected directory prefixes for a (lifecycle, type) pair.
 * @returns {string[]}
 */
export function expectedDirsFor(lifecycle, type) {
  if (lifecycle === 'pre_official') {
    return [
      LIFECYCLE_FOLDER_MAP.pre_official.default + '/',
      LIFECYCLE_FOLDER_MAP.pre_official.audits + '/',
    ];
  }
  if (lifecycle === 'official') {
    const primary = LIFECYCLE_FOLDER_MAP.official[type] || LIFECYCLE_FOLDER_MAP.official.default;
    return [`${primary}/`];
  }
  if (lifecycle === 'post_official') {
    const primary =
      type === 'plan'
        ? LIFECYCLE_FOLDER_MAP.post_official.plan
        : LIFECYCLE_FOLDER_MAP.post_official.default;
    return [`${primary}/`];
  }
  return [];
}

/**
 * @param {'promote'|'demote'|'supersede'} op
 * @param {string} fromLifecycle
 * @returns {{ code: string, message: string } | null}
 */
export function assertTransition(op, fromLifecycle) {
  if (!OPS.has(op)) {
    return { code: 'TRANSITION_ILLEGAL', message: `Unknown op: ${op}` };
  }
  if (op === 'promote' && fromLifecycle === 'pre_official') return null;
  if (op === 'demote' && (fromLifecycle === 'official' || fromLifecycle === 'pre_official')) {
    return null;
  }
  if (op === 'supersede' && fromLifecycle === 'official') return null;
  return {
    code: 'TRANSITION_ILLEGAL',
    message: `Illegal transition: ${op} from ${fromLifecycle}`,
  };
}

function targetLifecycle(op) {
  if (op === 'promote') return 'official';
  return 'post_official';
}

function targetStatus(op, _currentStatus) {
  // Promote always lands active (contract §4). Preserve-other-status is not in scope.
  if (op === 'promote') return 'active';
  if (op === 'supersede') return 'superseded';
  return 'done';
}

function planTokenOf(plan) {
  const canonical = JSON.stringify({
    op: plan.op,
    src: plan.src,
    dest: plan.dest,
    sourceSha256: plan.sourceSha256,
    desiredContentsSha256: sha256(plan.desiredContents),
    supersededBy: plan.supersededBy || null,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
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

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Commit a lifecycle rename/update. Stages deletions with `git add -u` so
 * post-`git mv` source pathspecs work (plain `git add -- src` fails).
 */
function commitLifecyclePaths(root, src, dest, extra, message) {
  const artifacts = [...new Set((extra || []).map(normPath))];
  if (dest !== src) {
    try {
      git(root, ['add', '-u', '--', src]);
    } catch {
      /* already staged by git mv */
    }
    git(root, ['add', '--', dest]);
  } else {
    git(root, ['add', '--', src]);
  }
  for (const p of artifacts) {
    if (existsSync(join(root, p))) git(root, ['add', '--', p]);
  }
  const pathspecs =
    dest !== src ? [src, dest, ...artifacts] : [src, ...artifacts];
  const msgFile = join(tmpdir(), `luna-lifecycle-${process.pid}-${Date.now()}.msg`);
  writeFileSync(msgFile, `${message}\n`, 'utf8');
  try {
    git(root, ['commit', '-F', msgFile, '--', ...pathspecs]);
  } finally {
    try {
      unlinkSync(msgFile);
    } catch {
      /* ignore */
    }
  }
  return git(root, ['rev-parse', 'HEAD']);
}

/**
 * @param {object} opts
 * @param {object} opts.vault
 * @param {string} opts.relPath
 * @param {'promote'|'demote'|'supersede'} opts.op
 * @param {string} [opts.supersededBy]
 * @param {string} [opts.destSubdir]
 */
export function planLifecycleMove(opts) {
  const vaultR = catchErr(() => requireAuthorizedVault(opts));
  if (!vaultR.ok) return vaultR;
  const vault = vaultR.value;
  const src = normPath(opts.relPath);
  const op = opts.op;

  if (isRulesPath(src)) {
    return {
      ok: false,
      error: { code: 'LIFECYCLE_SURFACE', message: 'rules/ is not a lifecycle surface' },
    };
  }

  const located = catchErr(() => assertAllowedPath(vault.root, src));
  if (!located.ok) return located;
  const { absPath } = located.value;
  if (!existsSync(absPath)) {
    return { ok: false, error: { code: 'MISSING', message: `Not found: ${src}` } };
  }

  const raw = readFileSync(absPath, 'utf8');
  const parsed = parseFrontmatter(raw);
  if (!parsed.hasFm) {
    return {
      ok: false,
      error: { code: 'FM_INVALID', message: 'front-matter required for lifecycle ops' },
    };
  }
  const fm = { ...parsed.data };
  const fromLifecycle = String(fm.lifecycle || '');
  const type = String(fm.type || 'reference');

  const illegal = assertTransition(op, fromLifecycle);
  if (illegal) return { ok: false, error: illegal };

  if (op === 'supersede') {
    const ptr = normPath(opts.supersededBy);
    if (!ptr) {
      return {
        ok: false,
        error: { code: 'TRANSITION_ILLEGAL', message: 'supersede requires superseded_by' },
      };
    }
    const ptrLoc = catchErr(() => assertAllowedPath(vault.root, ptr));
    if (!ptrLoc.ok) return ptrLoc;
    if (!existsSync(ptrLoc.value.absPath)) {
      return {
        ok: false,
        error: {
          code: 'TRANSITION_ILLEGAL',
          message: `superseded_by target missing: ${ptr}`,
        },
      };
    }
  }

  const nextLifecycle = targetLifecycle(op);
  const nextStatus = targetStatus(op, fm.status);
  const nextFm = {
    ...fm,
    lifecycle: nextLifecycle,
    status: nextStatus,
    updated: today(),
  };
  if (op === 'supersede') {
    nextFm.superseded_by = normPath(opts.supersededBy);
  }

  const fmErrs = validateFrontmatter(nextFm, { requireFm: true });
  if (fmErrs.length) {
    return { ok: false, error: { code: 'FM_INVALID', errors: fmErrs } };
  }

  let dest;
  try {
    dest = deriveDest(src, {
      lifecycle: nextLifecycle,
      type,
      destSubdir: opts.destSubdir,
    });
  } catch (e) {
    return { ok: false, error: { code: e.code || 'ERROR', message: e.message } };
  }

  const destLoc = catchErr(() => assertAllowedPath(vault.root, dest));
  if (!destLoc.ok) return destLoc;

  if (dest !== src && existsSync(destLoc.value.absPath)) {
    return {
      ok: false,
      error: { code: 'DEST_EXISTS', message: `Destination already exists: ${dest}` },
    };
  }

  const desiredContents = serializeFrontmatter(nextFm, parsed.body);
  const plan = {
    op,
    src,
    dest,
    sourceSha256: sha256(raw),
    desiredContents,
    nextFm,
    supersededBy: op === 'supersede' ? normPath(opts.supersededBy) : null,
    tagOnly: dest === src,
  };
  return { ok: true, plan, planToken: planTokenOf(plan) };
}

/**
 * @param {object} opts
 * @param {object} opts.vault
 * @param {object} opts.plan
 * @param {string} [opts.planToken]
 * @param {typeof commitPaths} [opts.commitFn]
 * @param {boolean} [opts.skipDocsIndex]
 */
export function applyLifecycleMove(opts) {
  const vaultR = catchErr(() => requireAuthorizedVault(opts));
  if (!vaultR.ok) return vaultR;
  const vault = vaultR.value;
  const plan = opts.plan;
  if (!plan || !plan.src || !plan.dest || !plan.desiredContents) {
    return { ok: false, error: { code: 'PLAN_INVALID', message: 'plan required' } };
  }

  if (opts.planTrailer) {
    return {
      ok: false,
      error: {
        code: 'TRAILER_FORBIDDEN',
        message: 'lifecycle ops never take a Plan: trailer',
      },
    };
  }

  const expectedToken = planTokenOf(plan);
  if (opts.planToken && opts.planToken !== expectedToken) {
    return { ok: false, error: { code: 'PLAN_STALE', message: 'planToken mismatch' } };
  }

  const srcLoc = catchErr(() => assertAllowedPath(vault.root, plan.src));
  if (!srcLoc.ok) return srcLoc;
  if (!existsSync(srcLoc.value.absPath)) {
    return { ok: false, error: { code: 'MISSING', message: `Not found: ${plan.src}` } };
  }
  const current = readFileSync(srcLoc.value.absPath, 'utf8');
  if (sha256(current) !== plan.sourceSha256) {
    return {
      ok: false,
      error: { code: 'PLAN_STALE', message: 'source content changed since plan' },
    };
  }

  const destLoc = catchErr(() => assertAllowedPath(vault.root, plan.dest));
  if (!destLoc.ok) return destLoc;
  if (plan.dest !== plan.src && existsSync(destLoc.value.absPath)) {
    return {
      ok: false,
      error: { code: 'DEST_EXISTS', message: `Destination already exists: ${plan.dest}` },
    };
  }

  const root = vault.root;
  const srcAbs = srcLoc.value.absPath;
  const destAbs = destLoc.value.absPath;
  const previousBytes = current;
  let moved = false;
  let wroteInPlace = false;

  try {
    // FM rewrite then move (contract §2 / §5)
    writeFileSync(srcAbs, plan.desiredContents, 'utf8');
    wroteInPlace = true;

    if (plan.dest !== plan.src) {
      mkdirSync(dirname(destAbs), { recursive: true });
      try {
        git(root, ['mv', '--', plan.src, plan.dest]);
      } catch {
        // fallback if path not yet tracked cleanly
        renameSync(srcAbs, destAbs);
      }
      moved = true;
    }

    let extra = [];
    if (!opts.skipDocsIndex && (isDocsPath(plan.src) || isDocsPath(plan.dest))) {
      const result = writeDocsIndex(root);
      extra = result.artifacts.filter((p) => existsSync(join(root, p)));
    }

    const message = `${LIFECYCLE_COMMIT_PREFIX} ${plan.op} ${plan.src} → ${plan.dest}`;
    const commitSha = opts.commitFn
      ? opts.commitFn(
          root,
          plan.dest === plan.src ? [plan.src, ...extra] : [plan.src, plan.dest, ...extra],
          message,
        )
      : commitLifecyclePaths(root, plan.src, plan.dest, extra, message);

    return {
      ok: true,
      relPath: plan.dest,
      src: plan.src,
      dest: plan.dest,
      commitSha,
      indexRefreshed: extra.length > 0,
    };
  } catch (e) {
    // rollback
    try {
      if (moved && existsSync(destAbs) && !existsSync(srcAbs)) {
        try {
          git(root, ['mv', '--', plan.dest, plan.src]);
        } catch {
          renameSync(destAbs, srcAbs);
        }
      }
      if (wroteInPlace && existsSync(srcAbs)) {
        writeFileSync(srcAbs, previousBytes, 'utf8');
      }
      if (!opts.skipDocsIndex && isDocsPath(plan.src)) {
        try {
          writeDocsIndex(root);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore rollback errors */
    }
    return {
      ok: false,
      error: {
        code: e?.code || 'GIT_COMMIT',
        message: String(e?.stderr || e?.message || e),
      },
      note: 'lifecycle move rolled back',
    };
  }
}

function walkMarkdown(dir, root, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'generated') continue;
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkMarkdown(abs, root, out);
    } else if (name.endsWith('.md')) {
      out.push(normPath(relative(root, abs)));
    }
  }
}

/**
 * Flag docs whose lifecycle tag does not match their folder (§10).
 * @param {string} root
 */
export function checkLifecycleDrift(root) {
  /** @type {Array<{ path: string, lifecycle: string, type: string, expectedDirs: string[], actualDir: string }>} */
  const mismatches = [];
  const files = [];
  for (const prefix of [
    'docs/specs',
    'docs/plans',
    'docs/decisions',
    'docs/pre-official',
    'docs/post-official',
  ]) {
    walkMarkdown(join(root, prefix), root, files);
  }

  for (const rel of files) {
    if (rel.endsWith('/README.md') && (rel.match(/\//g) || []).length <= 2) {
      // bucket READMEs often lack FM — skip if no FM
    }
    const abs = join(root, rel);
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseFrontmatter(text);
    if (!parsed.hasFm || !parsed.data.lifecycle) continue;
    const lifecycle = String(parsed.data.lifecycle);
    const type = String(parsed.data.type || 'reference');
    const expected = expectedDirsFor(lifecycle, type);
    if (!expected.length) continue;
    const actualDir = dirname(rel).replace(/\\/g, '/') + '/';
    const ok = expected.some((d) => actualDir === d || actualDir.startsWith(d));
    if (!ok) {
      mismatches.push({
        path: rel,
        lifecycle,
        type,
        expectedDirs: expected.map((d) => d.replace(/\/$/, '')),
        actualDir: actualDir.replace(/\/$/, ''),
      });
    }
  }
  return { mismatches };
}

export { planTokenOf };
