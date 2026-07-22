"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { vaultReuseSearch, vaultAdrDecisions } from "@/app/actions/vault";

type Hit = {
  source_vault: string;
  project_id: string;
  vault_id: string;
  source_path: string;
  source_sha256?: string;
  title?: string;
  lifecycle?: string;
  status?: string;
  score: number;
};

type SearchResult = {
  ok: boolean;
  scope?: string;
  hits?: Hit[];
  vaults?: Array<{ id: string; searched: boolean; reason: string | null }>;
  error?: { message: string };
};

type Adr = {
  path: string;
  title: string;
  status: string;
  governs: string[];
  superseded_by?: string | null;
};

/**
 * Reuse search + ADR why-view (read-only). Default scope is the current vault;
 * registry scope fans out with mandatory provenance and never copies anything.
 */
export function ReusePanel({ vaultId }: { vaultId: string }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"vault" | "vault+plugin" | "registry">("vault");
  const [hits, setHits] = useState<Hit[]>([]);
  const [vaults, setVaults] = useState<SearchResult["vaults"]>([]);
  const [adrs, setAdrs] = useState<Adr[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadAdrs = useCallback(() => {
    startTransition(async () => {
      const r = (await vaultAdrDecisions({ vaultId })) as { ok: boolean; decisions?: Adr[] };
      if (r.ok) setAdrs(r.decisions ?? []);
    });
  }, [vaultId]);

  useEffect(() => {
    loadAdrs();
  }, [loadAdrs]);

  const search = () => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const r = (await vaultReuseSearch({ vaultId, query, scope })) as SearchResult;
      if (!r.ok) {
        setErr(r.error?.message || "search failed");
        setHits([]);
        return;
      }
      setHits(r.hits ?? []);
      setVaults(r.vaults ?? []);
      const skipped = (r.vaults ?? []).filter((v) => !v.searched);
      setMsg(
        `${r.hits?.length ?? 0} hit(s) across ${scope}` +
          (skipped.length ? ` · ${skipped.length} vault(s) had no index` : ""),
      );
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          <strong className="text-slate-300">Reuse search</strong> — &quot;where did another project
          solve this?&quot; Read-only. Default is this vault; registry scope labels every hit with
          project/vault/path/hash and never copies memory across vaults.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-[16rem] flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
            placeholder="e.g. rate limiter, auth wall, retry backoff"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && query.trim() && search()}
          />
          <select
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-300"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="vault">vault</option>
            <option value="vault+plugin">vault+plugin</option>
            <option value="registry">registry</option>
          </select>
          <button
            type="button"
            className="rounded border border-emerald-700 px-3 py-1 text-sm text-emerald-300 disabled:opacity-50"
            onClick={search}
            disabled={pending || !query.trim()}
          >
            Search
          </button>
        </div>
        {msg && <p className="text-sm text-emerald-300">{msg}</p>}
        {err && <p className="text-sm text-red-300">{err}</p>}

        <ul className="space-y-2">
          {hits.map((h) => (
            <li
              key={`${h.source_vault}:${h.source_path}`}
              className="rounded border border-slate-800 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-200">{h.title || h.source_path}</span>
                <span className="font-mono text-xs text-slate-500">{h.score.toFixed(2)}</span>
              </div>
              <div className="font-mono text-xs text-slate-500">{h.source_path}</div>
              <div className="mt-1 font-mono text-[10px] text-slate-600">
                {h.source_vault} · {h.lifecycle}/{h.status} · {(h.source_sha256 || "").slice(0, 8)}
              </div>
            </li>
          ))}
          {!hits.length && !err && (
            <li className="text-sm text-slate-500">No results yet — run a search.</li>
          )}
        </ul>
        {vaults && vaults.some((v) => !v.searched) && (
          <p className="text-xs text-amber-300">
            No index:{" "}
            {vaults
              .filter((v) => !v.searched)
              .map((v) => v.id)
              .join(", ")}{" "}
            — build graph memory there to include them.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          <strong className="text-slate-300">ADR why-view</strong> — decisions and what they govern.
          Read-only; lifecycle changes stay in the doc-lifecycle flow.
        </p>
        <ul className="space-y-2">
          {adrs.map((a) => (
            <li key={a.path} className="rounded border border-slate-800 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-200">{a.title}</span>
                <span className="text-xs text-slate-500">{a.status}</span>
              </div>
              <div className="font-mono text-xs text-slate-500">{a.path}</div>
              {a.governs.length > 0 && (
                <div className="mt-1 text-xs text-slate-400">
                  governs: {a.governs.join(" · ")}
                </div>
              )}
              {a.superseded_by && (
                <div className="mt-1 text-xs text-amber-300">superseded by {a.superseded_by}</div>
              )}
            </li>
          ))}
          {!adrs.length && <li className="text-sm text-slate-500">No ADRs in docs/decisions/.</li>}
        </ul>
      </div>
    </div>
  );
}
