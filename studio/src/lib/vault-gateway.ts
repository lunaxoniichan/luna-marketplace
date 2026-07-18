/**
 * Studio-facing re-export of the vault gateway (keeps actions import path stable).
 * Implementation: scripts/lib/vault-gateway.mjs
 */
export {
  assertVaultId,
  summarizeSyncResult,
  planTokenFromSummary,
  vaultCreate,
  vaultUpdate,
  vaultDelete,
  vaultMerge,
  vaultReadSha,
  vaultWikilinks,
  vaultSyncPreview,
  vaultSyncApply,
} from "../../../scripts/lib/vault-gateway.mjs";
