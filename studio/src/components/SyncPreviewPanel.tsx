"use client";

import { useMemo, useState, useTransition } from "react";
import {
  vaultSyncPreviewMany,
  vaultSyncApplyMany,
} from "@/app/actions/vault";

type Target = { id: string; source: string };

type PreviewRow = {
  ok: boolean;
  vaultId?: string;
  status?: string;
  message?: string;
  planToken?: string;
  writes?: Array<{ path: string; kind?: string }>;
  conflicts?: Array<{ path: string; reason?: string }>;
  error?: { code: string; message: string };
};

export function SyncPreviewPanel({
  vaultId,
  fleetTargets,
}: {
  vaultId: string;
  fleetTargets: Target[];
}) {
  const allIds = useMemo(() => {
    const ids = new Set(fleetTargets.map((t) => t.id));
    ids.add(vaultId);
    return [...ids].sort();
  }, [fleetTargets, vaultId]);

  const [selected, setSelected] = useState<string[]>([vaultId]);
  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const selectFleet = () => setSelected(allIds);
  const selectCurrent = () => setSelected([vaultId]);

  const runPreview = () => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const r = await vaultSyncPreviewMany({ vaultIds: selected });
      if (!r.ok) {
        setErr((r as { error: { message: string } }).error?.message || "preview failed");
        return;
      }
      setPreviews(((r as { results: PreviewRow[] }).results || []) as PreviewRow[]);
      setMsg(`Previewed ${selected.length} target(s)`);
    });
  };

  const runApply = () => {
    setErr(null);
    setMsg(null);
    const targets = previews
      .filter((p) => p.ok && p.planToken && p.vaultId)
      .filter((p) => p.status !== "conflict" && !(p.conflicts && p.conflicts.length))
      .map((p) => ({ vaultId: p.vaultId!, planToken: p.planToken! }));
    if (!targets.length) {
      setErr("No applyable targets (preview first; conflicts are refused)");
      return;
    }
    startTransition(async () => {
      const r = await vaultSyncApplyMany({ targets });
      const results = (r as { results?: Array<{ vaultId: string; ok: boolean; error?: { message: string }; message?: string }> })
        .results || [];
      const fails = results.filter((x) => !x.ok);
      if (fails.length) {
        setErr(fails.map((f) => `${f.vaultId}: ${f.error?.message || "failed"}`).join(" · "));
      }
      setMsg(
        `Applied ${results.filter((x) => x.ok).length}/${results.length} — conflicts never clobber`,
      );
      // refresh preview
      const again = await vaultSyncPreviewMany({ vaultIds: selected });
      if (again.ok) setPreviews(((again as { results: PreviewRow[] }).results || []) as PreviewRow[]);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Dry-run → review → apply. Shaped for <strong className="text-slate-300">fleet</strong>{" "}
        (multi-target). Plugin <code>rules/</code> → every registry project is T5 (
        <code>sync --all</code>); today each selected vault still syncs from its own{" "}
        <code>rules/</code>.
      </p>

      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="rounded border border-slate-600 px-2 py-1" onClick={selectCurrent}>
          This vault
        </button>
        <button type="button" className="rounded border border-slate-600 px-2 py-1" onClick={selectFleet}>
          All targets (fleet list)
        </button>
      </div>

      <ul className="grid gap-1 sm:grid-cols-2 text-sm">
        {allIds.map((id) => {
          const meta = fleetTargets.find((t) => t.id === id);
          return (
            <li key={id}>
              <label className="flex items-center gap-2 rounded border border-slate-800 px-2 py-1">
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  onChange={() => toggle(id)}
                />
                <span className={id === vaultId ? "text-emerald-300" : "text-slate-300"}>{id}</span>
                <span className="badge">{meta?.source || (id === vaultId ? "current" : "?")}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1 text-sm disabled:opacity-50"
          onClick={runPreview}
          disabled={pending || !selected.length}
        >
          Preview (dry-run)
        </button>
        <button
          type="button"
          className="rounded bg-emerald-800 px-3 py-1 text-sm text-emerald-100 disabled:opacity-50"
          onClick={runApply}
          disabled={pending || !previews.length}
        >
          Apply selected previews
        </button>
      </div>

      {msg && <p className="text-sm text-emerald-300">{msg}</p>}
      {err && <p className="text-sm text-red-300">{err}</p>}

      <div className="space-y-3">
        {previews.map((p) => (
          <div
            key={p.vaultId || JSON.stringify(p)}
            className="rounded border border-slate-800 bg-slate-950/40 p-3 text-sm"
          >
            <div className="flex flex-wrap gap-2">
              <span className="font-medium text-slate-200">{p.vaultId}</span>
              {p.ok ? (
                <span className={`badge ${p.status === "conflict" ? "badge-alert" : "badge-ok"}`}>
                  {p.status}
                </span>
              ) : (
                <span className="badge badge-alert">{p.error?.code}</span>
              )}
            </div>
            <p className="mt-1 text-slate-400">{p.ok ? p.message : p.error?.message}</p>
            {p.ok && p.writes && p.writes.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-slate-500">
                {p.writes.map((w) => (
                  <li key={w.path}>
                    write {w.kind}: {w.path}
                  </li>
                ))}
              </ul>
            )}
            {p.ok && p.conflicts && p.conflicts.length > 0 && (
              <ul className="mt-2 text-xs text-red-300">
                {p.conflicts.map((c) => (
                  <li key={c.path}>
                    conflict {c.path}: {c.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
