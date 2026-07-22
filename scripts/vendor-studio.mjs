#!/usr/bin/env node
/**
 * vendor-studio.mjs — copy the plugin's canonical `scripts/**.mjs` into
 * `studio/.plugin/scripts/` (gitignored) so the host-first Studio can import them
 * from INSIDE its own Turbopack root.
 *
 * Why: Studio imports the plugin libs directly (single source of truth). Turbopack's
 * root is `studio/`, so it cannot bundle files under the parent `scripts/` for a
 * production `next build` (dev is lenient; prod is not — T14). Vendoring a fresh copy
 * inside the root fixes prod without moving the root (which breaks dev). The copy is
 * a rebuildable, gitignored projection — markdown+git and `scripts/` stay authoritative.
 *
 * Runs from `predev` / `prebuild` / `pretypecheck` in studio/package.json.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcScripts = join(pluginRoot, 'scripts');
const destRoot = join(pluginRoot, 'studio', '.plugin');
const destScripts = join(destRoot, 'scripts');

/** Recursively copy only *.mjs (skip .py, __pycache__, node_modules, the dest itself). */
function copyMjs(srcDir, destDir) {
  for (const name of readdirSync(srcDir)) {
    if (name === 'node_modules' || name === '__pycache__') continue;
    const s = join(srcDir, name);
    const d = join(destDir, name);
    const st = statSync(s);
    if (st.isDirectory()) {
      copyMjs(s, d);
    } else if (name.endsWith('.mjs')) {
      mkdirSync(dirname(d), { recursive: true });
      cpSync(s, d);
    }
  }
}

function main() {
  // Fresh projection every run — drop then recreate (rebuildable index).
  if (existsSync(destScripts)) rmSync(destScripts, { recursive: true, force: true });
  mkdirSync(destScripts, { recursive: true });
  copyMjs(srcScripts, destScripts);
  writeFileSync(
    join(destRoot, 'README.md'),
    '# .plugin — generated\n\nGitignored vendor copy of `../../scripts/**.mjs` for Turbopack ' +
      '(see `scripts/vendor-studio.mjs`). Do not edit; rebuilt on predev/prebuild.\n',
    'utf8',
  );
  console.log(`vendored plugin scripts → studio/.plugin/scripts`);
}

main();
