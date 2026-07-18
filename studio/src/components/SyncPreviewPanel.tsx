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
  const [mode, setMode] = useState<"fleet" | "local">("fleet");
  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [stale, setStale] = useState(false);

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const selectFleet = () => {
    setSelected(allIds);
    setMode("fleet");
  };
  const selectCurrent = () => setSelected([vaultId]);

  const runPreview = () => {
    setErr(null);
    setMsg(null);
    setStale(false);
    startTransition(async () => {
      const r = await vaultSyncPreviewMany({ vaultIds: selected, mode });
      if (!r.ok) {
        setErr((r as { error: { message: string } }).error?.message || "preview failed");
        return;
      }
      setPreviews(((r as { results: PreviewRow[] }).results || []) as PreviewRow[]);
      setMsg(`Previewed ${selected.length} target(s) · mode=${mode}`);
    });
  };

  const runApply = () => {
    setErr(null);
    setMsg(null);
    setStale(false);
    const targets = previews
      .filter((p) => p.ok && p.planToken && p.vaultId)
      .filter((p) => p.status !== "conflict" && !(p.conflicts && p.conflicts.length))
      .map((p) => ({ vaultId: p.vaultId!, planToken: p.planToken! }));
    if (!targets.length) {
      setErr("No applyable targets (preview first; conflicts are refused)");
      return;
    }
    startTransition(async () => {
      const r = await vaultSyncApplyMany({ targets, mode });
      const results =
        (
          r as {
            results?: Array<{
              vaultId: string;
              ok: boolean;
              error?: { code?: string; message: string };
              message?: string;
            }>;
          }
        ).results || [];
      const fails = results.filter((x) => !x.ok);
      const staleFails = fails.filter((f) => f.error?.code === "PLAN_STALE");
      if (staleFails.length) {
        setStale(true);
        setErr(
          `Preview stale for ${staleFails.map((f) => f.vaultId).join(", ")} — working tree changed. Re-preview, then apply again.`,
        );
        setPreviews([]);
        return;
      }
      if (fails.length) {
        setErr(fails.map((f) => `${f.vaultId}: ${f.error?.message || "failed"}`).join(" · "));
      }
      setMsg(
        `Applied ${results.filter((x) => x.ok).length}/${results.length} · mode=${mode} — conflicts never clobber`,
      );
      const again = await vaultSyncPreviewMany({ vaultIds: selected, mode });
      if (again.ok) setPreviews(((again as { results: PreviewRow[] }).results || []) as PreviewRow[]);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Dry-run → review → apply.{" "}
        <strong className="text-slate-300">Fleet mode</strong> regenerates from plugin{" "}
        <code>rules/</code> into each target&apos;s <code>.claude</code> / <code>.cursor</code>.{" "}
        Local mode uses each vault&apos;s own <code>rules/</code> (dogfood/CI). Writes leave
        targets dirty unless you commit in each repo (CLI <code>--commit</code>).
      </p>

      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" className="rounded border border-slate-600 px-2 py-1" onClick={selectCurrent}>
          This vault
        </button>
        <button type="button" className="rounded border border-slate-600 px-2 py-1" onClick={selectFleet}>
          All targets (fleet list)
        </button>
        <label className="ml-2 flex items-center gap-2 rounded border border-slate-700 px-2 py-1">
          <span className="text-slate-400">Mode</span>
          <select
            className="rounded border border-slate-600 bg-slate-950 px-1 py-0.5 text-slate-200"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as "fleet" | "local");
              setPreviews([]);
            }}
          >
            <option value="fleet">fleet (plugin rules/)</option>
            <option value="local">local (per-vault rules/)</option>
          </select>
        </label>
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
      {stale && (
        <button
          type="button"
          className="rounded border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-200"
          onClick={runPreview}
          disabled={pending || !selected.length}
        >
          Re-preview now (required after PLAN_STALE)
        </button>
      )}

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
