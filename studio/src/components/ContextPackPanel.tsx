"use client";

import { useState, useTransition } from "react";
import {
  vaultContextPackBuild,
  vaultContextPackPreview,
  vaultContextPackDrift,
} from "@/app/actions/vault";

type PackItem = {
  source_path: string;
  source_kind: string;
  title: string;
  excerpt?: string;
  score: number;
  token_estimate?: number;
  stale?: boolean;
  why?: Array<{ lane: string; score: number }>;
};

type PackManifest = {
  pack_id: string;
  pack_type: string;
  status: string;
  scope: string;
  token_budget: number;
  tokens_used?: number;
  truncated?: boolean;
  items: PackItem[];
  lanes?: Record<string, string>;
  warnings?: string[];
};

function tabForPath(path: string): "memory" | "rules" | "docs" | null {
  if (path.startsWith("rules/")) return "rules";
  if (path.startsWith("memory/") || path.startsWith(".claude/memory/")) return "memory";
  if (path.startsWith("docs/") || path.startsWith(".claude/rules/lessons")) return "docs";
  return null;
}

export function ContextPackPanel({
  vaultId,
  onOpenPath,
}: {
  vaultId: string;
  onOpenPath: (relPath: string, tab: "memory" | "rules" | "docs") => void;
}) {
  const [task, setTask] = useState("");
  const [packType, setPackType] = useState<"planning" | "implementation" | "review">(
    "planning",
  );
  const [budget, setBudget] = useState(4000);
  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [drifts, setDrifts] = useState<Array<{ class: string; source_path: string; detail: string }> | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (mode: "preview" | "build") => {
    startTransition(async () => {
      setErr(null);
      setMsg(null);
      setDrifts(null);
      const input = {
        vaultId,
        task,
        packType,
        tokenBudget: budget,
        scope: "vault",
      };
      const r =
        mode === "preview"
          ? await vaultContextPackPreview(input)
          : await vaultContextPackBuild(input);
      if (!r.ok) {
        setManifest(null);
        setErr((r as { error?: { message?: string } }).error?.message || `${mode} failed`);
        return;
      }
      const m = (r as { manifest?: PackManifest }).manifest;
      if (!m) {
        setManifest(null);
        setErr("missing manifest");
        return;
      }
      setManifest(m);
      if (mode === "build") {
        setMsg(
          `Wrote pack ${(r as { packId?: string }).packId || m.pack_id} under docs/generated/context-packs/ (gitignored)`,
        );
      }
    });
  };

  const checkDrift = () => {
    if (!manifest) return;
    startTransition(async () => {
      setErr(null);
      const r = await vaultContextPackDrift({ vaultId, manifest });
      if (!r.ok) {
        setDrifts(null);
        setErr((r as { error?: { message?: string } }).error?.message || "drift check failed");
        return;
      }
      setDrifts(((r as { drifts?: typeof drifts }).drifts || []) as NonNullable<typeof drifts>);
    });
  };

  return (
    <div className="space-y-4" data-testid="context-pack-panel">
      <div>
        <h3 className="text-sm font-medium text-slate-200">Context pack</h3>
        <p className="text-xs text-slate-500">
          Task-shaped manifest over graph-memory lanes · rebuildable index only · never writes
          canonical memory
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-slate-400">Task</span>
        <textarea
          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          rows={2}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="What are you working on?"
        />
      </label>

      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-slate-400">Type</span>
          <select
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
            value={packType}
            onChange={(e) =>
              setPackType(e.target.value as "planning" | "implementation" | "review")
            }
          >
            <option value="planning">planning</option>
            <option value="implementation">implementation</option>
            <option value="review">review</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-slate-400">Token budget</span>
          <input
            type="number"
            min={1}
            className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value) || 1)}
          />
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 disabled:opacity-40"
          disabled={pending || !task.trim()}
          onClick={() => run("preview")}
        >
          Preview
        </button>
        <button
          type="button"
          className="rounded border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-sm text-emerald-300 disabled:opacity-40"
          disabled={pending || !task.trim()}
          onClick={() => run("build")}
        >
          Build
        </button>
        <button
          type="button"
          className="rounded border border-amber-800/80 px-3 py-1 text-sm text-amber-300/90 disabled:opacity-40"
          disabled={pending || !manifest}
          onClick={checkDrift}
        >
          Check drift
        </button>
      </div>

      {err && <p className="text-sm text-rose-400">{err}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      {drifts && (
        <div className="rounded border border-amber-900/50 bg-amber-950/20 p-3 text-sm">
          <h4 className="text-amber-200">Drift ({drifts.length})</h4>
          {drifts.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">No drift — pack sources still match</p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-100/90">
              {drifts.map((d, i) => (
                <li key={`${d.source_path}:${d.class}:${i}`}>
                  <span className="font-mono text-amber-300">{d.class}</span> · {d.source_path}
                  <span className="text-slate-500"> — {d.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {manifest && (
        <div className="space-y-3 rounded border border-slate-800 bg-slate-950/40 p-3">
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span>
              status <strong className="text-slate-200">{manifest.status}</strong>
            </span>
            <span>
              scope <strong className="text-slate-200">{manifest.scope}</strong>
            </span>
            <span>
              tokens{" "}
              <strong className="text-slate-200">
                {manifest.tokens_used ?? "?"}/{manifest.token_budget}
              </strong>
              {manifest.truncated ? " · truncated" : ""}
            </span>
            <span className="font-mono text-slate-500">{manifest.pack_id}</span>
          </div>
          {manifest.lanes && (
            <p className="text-xs text-slate-500">
              lanes:{" "}
              {Object.entries(manifest.lanes)
                .map(([k, v]) => `${k}=${v}`)
                .join(" · ")}
            </p>
          )}
          {manifest.warnings?.length ? (
            <ul className="text-xs text-amber-400/90">
              {manifest.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {manifest.items.map((it) => {
              const tab = tabForPath(it.source_path);
              return (
                <li
                  key={`${it.source_path}:${it.title}`}
                  className="rounded border border-slate-800 px-2 py-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-slate-200">{it.title || it.source_path}</div>
                      <div className="font-mono text-xs text-slate-500">{it.source_path}</div>
                    </div>
                    <div className="shrink-0 text-xs text-slate-500">
                      {it.source_kind} · {it.score}
                      {it.stale ? " · stale" : ""}
                    </div>
                  </div>
                  {it.excerpt ? (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">{it.excerpt}</p>
                  ) : null}
                  {tab ? (
                    <button
                      type="button"
                      className="mt-1 text-xs text-emerald-400/90 hover:underline"
                      onClick={() => onOpenPath(it.source_path, tab)}
                    >
                      Open
                    </button>
                  ) : null}
                </li>
              );
            })}
            {!manifest.items.length && (
              <li className="text-slate-500">No items under budget / query</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
