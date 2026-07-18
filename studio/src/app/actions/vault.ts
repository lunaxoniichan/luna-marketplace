"use server";

/**
 * Server Actions — thin wrappers. Clients pass vaultId only (never roots/paths).
 * See docs/specs/2026-07-18-studio-server-actions-contract.md
 */
import {
  vaultCreate as create,
  vaultUpdate as update,
  vaultDelete as del,
  vaultMerge as merge,
  vaultRead as read,
  vaultReadSha as readSha,
  vaultList as list,
  vaultWikilinks as wikilinks,
  vaultSyncPreview as syncPreview,
  vaultSyncPreviewMany as syncPreviewMany,
  vaultSyncApply as syncApply,
  vaultSyncApplyMany as syncApplyMany,
  listSyncTargets as syncTargets,
} from "@/lib/vault-gateway";

export async function vaultCreate(input: Record<string, unknown>) {
  return create(input);
}

export async function vaultUpdate(input: Record<string, unknown>) {
  return update(input);
}

export async function vaultDelete(input: Record<string, unknown>) {
  return del(input);
}

export async function vaultMerge(input: Record<string, unknown>) {
  return merge(input);
}

export async function vaultRead(input: Record<string, unknown>) {
  return read(input);
}

export async function vaultReadSha(input: Record<string, unknown>) {
  return readSha(input);
}

export async function vaultList(input: Record<string, unknown>) {
  return list(input);
}

export async function vaultWikilinks(input: Record<string, unknown>) {
  return wikilinks(input);
}

export async function vaultSyncPreview(input: Record<string, unknown>) {
  return syncPreview(input);
}

export async function vaultSyncPreviewMany(input: Record<string, unknown>) {
  return syncPreviewMany(input);
}

export async function vaultSyncApply(input: Record<string, unknown>) {
  return syncApply(input);
}

export async function vaultSyncApplyMany(input: Record<string, unknown>) {
  return syncApplyMany(input);
}

export async function listSyncTargets() {
  return syncTargets();
}
