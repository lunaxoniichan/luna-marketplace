"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { vaultDedupeReport } from "@/app/actions/vault";

type ClusterItem = {
  project_id: string;
  path: string;
  kind: string;
  title: string;
};

type Cluster = {
  id: string;
  score: number;
  items: ClusterItem[];
  why: {
    shared_keywords: string[];
    keyword_jaccard: number;
    title_token_jaccard: number;
    shingle_jaccard: number;
    score: number;
  };
  signals: Array<{ kind: string; version: number; score: number }>;
};

type Report = {
  version: number;
  generated_at: string;
  scope: { mode: string; vaultId: string };
  corpus: { item_count: number; compared_count: number; truncated: boolean };
  clusters: Cluster[];
};

function tabForPath(path: string): "memory" | "rules" | "docs" | null {
  if (path.startsWith("rules/")) return "rules";
  if (path.startsWith("memory/") || path.startsWith(".claude/memory/")) return "memory";
  if (path.startsWith("docs/")) return "docs";
  return null;
}

export function DedupePanel({
  vaultId,
  onOpenPath,
}: {
  vaultId: string;
  onOpenPath: (relPath: string, tab: "memory" | "rules" | "docs") => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const r = await vaultDedupeReport({ vaultId, scopeMode: "vault" });
      if (!r.ok) {
        setErr((r as { error: { message: string } }).error?.message || "dedupe failed");
        setReport(null);
        return;
      }
      const rep = (r as { report: Report }).report;
      setReport(rep);
      setSelectedId(rep.clusters[0]?.id ?? null);
      setMsg(
        rep.clusters.length
          ? `${rep.clusters.length} candidate cluster(s) · compared ${rep.corpus.compared_count}`
          : `No overlap above threshold · compared ${rep.corpus.compared_count}`,
      );
    });
  }, [vaultId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selected = report?.clusters.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
        Candidates for review — consolidate in the editor. No auto-merge. Lexical keyword pass
        only (semantic embeddings deferred to Phase 3).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-300 disabled:opacity-50"
          onClick={refresh}
          disabled={pending}
        >
          Refresh
        </button>
        {report?.corpus.truncated && (
          <span className="text-xs text-amber-300">Corpus/caps truncated — results partial</span>
        )}
      </div>

      {msg && <p className="text-sm text-emerald-300">{msg}</p>}
      {err && <p className="text-sm text-red-300">{err}</p>}

      {!report && !err && <p className="text-sm text-slate-500">Loading overlap report…</p>}

      {report && (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto text-sm">
            {report.clusters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`w-full rounded border px-2 py-2 text-left ${
                    selectedId === c.id
                      ? "border-emerald-700 bg-slate-900 text-emerald-200"
                      : "border-slate-800 text-slate-400 hover:border-slate-600"
                  }`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="flex justify-between gap-2 font-mono text-xs">
                    <span>{c.score.toFixed(2)}</span>
                    <span className="text-slate-500">{c.items.length} items</span>
                  </div>
                  <div className="mt-1 truncate text-xs">
                    {c.items.map((i) => i.path.split("/").pop()).join(" · ")}
                  </div>
                </button>
              </li>
            ))}
            {!report.clusters.length && (
              <li className="text-slate-500">No clusters above threshold.</li>
            )}
          </ul>

          <div className="space-y-3">
            {!selected && (
              <p className="text-sm text-slate-500">Select a cluster to preview.</p>
            )}
            {selected && (
              <>
                <div className="rounded border border-slate-800 p-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Why</div>
                  <p className="mt-1 text-slate-300">
                    shared:{" "}
                    <code className="text-emerald-300">
                      {selected.why.shared_keywords.join(", ") || "—"}
                    </code>
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    kwJ={selected.why.keyword_jaccard.toFixed(2)} · ttJ=
                    {selected.why.title_token_jaccard.toFixed(2)} · shJ=
                    {selected.why.shingle_jaccard.toFixed(2)} · signal=
                    {selected.signals.map((s) => s.kind).join("+")}
                  </p>
                </div>

                <ul className="space-y-2">
                  {selected.items.map((it) => {
                    const tab = tabForPath(it.path);
                    return (
                      <li
                        key={`${it.project_id}:${it.path}`}
                        className="rounded border border-slate-800 px-3 py-2 text-sm"
                      >
                        <div className="font-medium text-slate-200">{it.title || it.path}</div>
                        <div className="font-mono text-xs text-slate-500">{it.path}</div>
                        <div className="mt-1 text-xs text-slate-500">kind={it.kind}</div>
                        {tab ? (
                          <button
                            type="button"
                            className="mt-2 text-xs text-emerald-400 hover:underline"
                            onClick={() => onOpenPath(it.path, tab)}
                          >
                            Open in editor →
                          </button>
                        ) : (
                          <p className="mt-2 text-xs text-amber-300">
                            Not vault-editable here (generated / protected path) — consolidate via
                            canonical source.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {selected.items.length >= 2 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selected.items.slice(0, 2).map((it) => (
                      <div
                        key={`preview:${it.path}`}
                        className="rounded border border-slate-800 bg-slate-950/60 p-2"
                      >
                        <div className="truncate font-mono text-[10px] text-slate-500">
                          {it.path}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{it.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
