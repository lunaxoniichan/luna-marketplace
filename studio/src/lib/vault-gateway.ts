/**
 * Studio-facing re-export of the vault gateway (keeps actions import path stable).
 * Implementation: scripts/lib/vault-gateway.mjs
 */
export {
  assertVaultId,
  assertBodySize,
  assertCtxAllowed,
  normalizeError,
  MAX_BODY_BYTES,
  summarizeSyncResult,
  planTokenFromSummary,
  vaultCreate,
  vaultUpdate,
  vaultDelete,
  vaultMerge,
  vaultRead,
  vaultReadSha,
  vaultList,
  vaultWikilinks,
  vaultSyncPreview,
  vaultSyncPreviewMany,
  vaultSyncApply,
  vaultSyncApplyMany,
  vaultLifecyclePreview,
  vaultLifecycleApply,
  vaultDedupeReport,
  listSyncTargets,
} from "../../../scripts/lib/vault-gateway.mjs";
