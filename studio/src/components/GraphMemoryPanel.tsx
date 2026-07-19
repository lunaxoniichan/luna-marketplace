"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  vaultGraphMemoryRebuild,
  vaultGraphMemorySearch,
  vaultGraphMemoryStatus,
} from "@/app/actions/vault";

type Hit = {
  source_path: string;
  source_kind: string;
  title: string;
  excerpt: string;
  score: number;
  stale?: boolean;
  lifecycle?: string;
  why?: Array<{ lane: string; score: number }>;
};

type Status = {
  mode?: string;
  local_ai?: string;
  embeddings?: string;
  embedding_model?: string | null;
  embedded_count?: number;
  chunk_total?: number;
  graph_backend?: string;
  graphiti?: string;
  warnings?: string[];
};

function tabForPath(path: string): "memory" | "rules" | "docs" | null {
  if (path.startsWith("rules/")) return "rules";
  if (path.startsWith("memory/") || path.startsWith(".claude/memory/")) return "memory";
  if (path.startsWith("docs/") || path.startsWith(".claude/rules/lessons")) return "docs";
  return null;
}

export function GraphMemoryPanel({
  vaultId,
  onOpenPath,
}: {
  vaultId: string;
  onOpenPath: (relPath: string, tab: "memory" | "rules" | "docs") => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refreshStatus = useCallback(() => {
    startTransition(async () => {
      setErr(null);
      const r = await vaultGraphMemoryStatus({ vaultId });
      if (!r.ok) {
        setStatus(null);
        setErr((r as { error?: { message?: string } }).error?.message || "status failed");
        return;
      }
      setStatus((r as { status: Status }).status);
    });
  }, [vaultId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const onSearch = () => {
    startTransition(async () => {
      setErr(null);
      const r = await vaultGraphMemorySearch({ vaultId, query });
      if (!r.ok) {
        setHits([]);
        setErr((r as { error?: { message?: string } }).error?.message || "search failed");
        return;
      }
      setHits(((r as { hits?: Hit[] }).hits || []) as Hit[]);
    });
  };

  const onRebuild = () => {
    startTransition(async () => {
      setErr(null);
      setMsg(null);
      const r = await vaultGraphMemoryRebuild({ vaultId });
      if (!r.ok) {
        setErr((r as { error?: { message?: string } }).error?.message || "rebuild failed");
        return;
      }
      setMsg(
        `Rebuilt ${(r as { sources?: number }).sources ?? "?"} sources · mode ${
          (r as { status?: Status }).status?.mode ?? "?"
        }`,
      );
      refreshStatus();
    });
  };

  return (
    <div className="space-y-4" data-testid="graph-memory-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Graph memory</h3>
          <p className="text-xs text-slate-500">
            Rebuildable index · read-only query · never writes native Claude memory
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300"
            disabled={pending}
            onClick={refreshStatus}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded border border-emerald-800 px-3 py-1 text-sm text-emerald-300"
            disabled={pending}
            onClick={onRebuild}
          >
            Rebuild index
          </button>
        </div>
      </div>

      {status && (
        <dl className="grid grid-cols-2 gap-2 rounded border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400 sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">mode</dt>
            <dd className="text-slate-200">{status.mode ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">embeddings</dt>
            <dd className="text-slate-200">
              {status.embeddings ?? "—"}
              {typeof status.embedded_count === "number" &&
              typeof status.chunk_total === "number"
                ? ` (${status.embedded_count}/${status.chunk_total})`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">graph</dt>
            <dd className="text-slate-200">{status.graph_backend ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">local-ai</dt>
            <dd className="text-slate-200">{status.local_ai ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">graphiti</dt>
            <dd className="text-slate-200">{status.graphiti ?? "—"}</dd>
          </div>
          {status.warnings && status.warnings.length > 0 && (
            <div className="col-span-full text-amber-200/90">
              {status.warnings.join(" · ")}
            </div>
          )}
        </dl>
      )}

      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          placeholder="Search context (lexical + authority ranking)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
        />
        <button
          type="button"
          className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200"
          disabled={pending || !query.trim()}
          onClick={onSearch}
        >
          Search
        </button>
      </div>

      {err && <p className="text-sm text-rose-300">{err}</p>}
      {msg && <p className="text-sm text-emerald-300">{msg}</p>}

      <ul className="space-y-2">
        {hits.map((h) => {
          const tab = tabForPath(h.source_path);
          return (
            <li
              key={`${h.source_path}:${h.score}:${h.excerpt?.slice(0, 24)}`}
              className="rounded border border-slate-800 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <button
                  type="button"
                  className="text-left text-emerald-300 underline-offset-2 hover:underline"
                  disabled={!tab}
                  onClick={() => tab && onOpenPath(h.source_path, tab)}
                >
                  {h.title || h.source_path}
                </button>
                <span className="text-xs text-slate-500">
                  {h.source_kind} · {h.score}
                  {h.stale ? " · stale" : ""}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{h.source_path}</p>
              <p className="mt-1 text-xs text-slate-400">{h.excerpt}</p>
              {h.why && h.why.length > 0 && (
                <p className="mt-1 text-[11px] text-slate-600">
                  why: {h.why.map((w) => `${w.lane}:${w.score}`).join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
