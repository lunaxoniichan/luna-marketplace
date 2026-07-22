#!/usr/bin/env node
/**
 * correction-inbox.mjs — review/accept/reject candidate lessons.
 * Contract: docs/specs/2026-07-20-context-pack-contract.md §D5.
 *
 * Usage:
 *   node scripts/correction-inbox.mjs list   --vault <id> [--pending <path>]
 *   node scripts/correction-inbox.mjs accept --vault <id> --what <text> --pref <text> [--portable]
 *   node scripts/correction-inbox.mjs reject --vault <id> [--id <candidateId>]
 *
 * Accept appends ONLY to .claude/rules/lessons.md + .cursor/rules/lessons.mdc
 * (via the shared append helper). Never routes through vault-crud; never writes memory.
 */
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listCorrectionCandidates,
  acceptCorrection,
  rejectCorrection,
} from './lib/correction-inbox.mjs';

function pluginRootFromArgs(args) {
  const i = args.indexOf('--root');
  if (i >= 0 && args[i + 1]) return resolve(args[i + 1]);
  if (process.env.LUNA_PLUGIN_ROOT) return resolve(process.env.LUNA_PLUGIN_ROOT);
  return resolve(fileURLToPath(new URL('..', import.meta.url)));
}

function argValue(args, name) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return null;
}

function usage() {
  console.log(`Usage:
  node scripts/correction-inbox.mjs list   --vault <id> [--pending <path>]
  node scripts/correction-inbox.mjs accept --vault <id> --what <text> --pref <text> [--portable]
  node scripts/correction-inbox.mjs reject --vault <id> [--id <candidateId>]
`);
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    process.exit(0);
  }
  const pluginRoot = pluginRootFromArgs(args);
  const vaultId = argValue(args, '--vault') || basename(pluginRoot);

  try {
    if (cmd === 'list') {
      const out = listCorrectionCandidates({
        vaultId,
        pluginRoot,
        pendingFile: argValue(args, '--pending') || undefined,
      });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    if (cmd === 'accept') {
      const out = acceptCorrection({
        vaultId,
        candidateId: argValue(args, '--id') || undefined,
        what_claude_did: argValue(args, '--what') || '',
        implied_preference: argValue(args, '--pref') || '',
        applies_to: args.includes('--portable') ? 'all_projects' : 'this_project',
        pluginRoot,
      });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    if (cmd === 'reject') {
      const out = rejectCorrection({
        vaultId,
        candidateId: argValue(args, '--id') || undefined,
        pluginRoot,
      });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    usage();
    process.exit(1);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: { code: e.code || 'ERROR', message: e.message } }));
    process.exit(1);
  }
}

main();
