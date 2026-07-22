"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  vaultCreate,
  vaultUpdate,
  vaultDelete,
  vaultRead,
  vaultList,
  vaultWikilinks,
  vaultLifecyclePreview,
  vaultLifecycleApply,
} from "@/app/actions/vault";
import { SyncPreviewPanel } from "@/components/SyncPreviewPanel";
import { DedupePanel } from "@/components/DedupePanel";
import { GraphMemoryPanel } from "@/components/GraphMemoryPanel";
import { ContextPackPanel } from "@/components/ContextPackPanel";
import { CorrectionInboxPanel } from "@/components/CorrectionInboxPanel";
import { ReusePanel } from "@/components/ReusePanel";

type WikiTarget = { slug: string; path: string; title: string };

type FmState = {
  title: string;
  scope: string;
  type: string;
  lifecycle: string;
  status: string;
  keywords: string;
};

const emptyFm = (): FmState => ({
  title: "",
  scope: "project",
  type: "memory",
  lifecycle: "official",
  status: "active",
  keywords: "",
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function VaultWorkspace({
  vaultId,
  fleetTargets,
}: {
  vaultId: string;
  fleetTargets: Array<{ id: string; source: string }>;
}) {
  const pluginVaultId = useMemo(
    () => fleetTargets.find((t) => t.source === "plugin")?.id ?? null,
    [fleetTargets],
  );
  const isPluginVault = useMemo(() => {
    const self = fleetTargets.find((t) => t.id === vaultId);
    return self?.source === "plugin" || (pluginVaultId != null && vaultId === pluginVaultId);
  }, [fleetTargets, vaultId, pluginVaultId]);
  const rulesReadOnly = !isPluginVault;

  const [tab, setTab] = useState<
    "memory" | "rules" | "docs" | "sync" | "dedupe" | "graph" | "pack" | "corrections" | "reuse"
  >("memory");
  const [lists, setLists] = useState<{ rules: string[]; memory: string[]; docs: string[] }>({
    rules: [],
    memory: [],
    docs: [],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [fm, setFm] = useState<FmState>(emptyFm());
  const [confirmSha, setConfirmSha] = useState<string | null>(null);
  const [wikis, setWikis] = useState<WikiTarget[]>([]);
  const [wikiQ, setWikiQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [planHint, setPlanHint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [supersededBy, setSupersededBy] = useState("");
  const [lifecyclePreview, setLifecyclePreview] = useState<{
    op: string;
    src: string;
    dest: string;
    planToken: string;
    tagOnly?: boolean;
  } | null>(null);

  const refreshList = useCallback(() => {
    startTransition(async () => {
      const r = await vaultList({ vaultId });
      if (r.ok) {
        setLists({
          rules: (r as { rules: string[] }).rules || [],
          memory: (r as { memory: string[] }).memory || [],
          docs: (r as { docs: string[] }).docs || [],
        });
      }
      const w = await vaultWikilinks({ vaultId });
      if (w.ok) setWikis(((w as { targets: WikiTarget[] }).targets || []) as WikiTarget[]);
    });
  }, [vaultId]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const paths = useMemo(() => {
    if (tab === "rules") return lists.rules;
    if (tab === "docs") return lists.docs;
    return lists.memory;
  }, [tab, lists]);

  const loadFile = (relPath: string) => {
    setCreating(false);
    setSelected(relPath);
    setMsg(null);
    setErr(null);
    setWarnings([]);
    setLifecyclePreview(null);
    startTransition(async () => {
      const r = await vaultRead({ vaultId, relPath });
      if (!r.ok) {
        setErr((r as { error: { message: string } }).error?.message || "read failed");
        return;
      }
      const data = r as {
        body: string;
        frontmatter: Record<string, unknown>;
        confirmSha: string;
        hasFrontmatter: boolean;
      };
      setBody(data.body || "");
      setConfirmSha(data.confirmSha);
      const f = data.frontmatter || {};
      setFm({
        title: String(f.title || ""),
        scope: String(f.scope || "project"),
        type: String(f.type || (relPath.startsWith("memory/") ? "memory" : "spec")),
        lifecycle: String(f.lifecycle || "official"),
        status: String(f.status || "active"),
        keywords: Array.isArray(f.keywords) ? f.keywords.join(", ") : String(f.keywords || ""),
      });
    });
  };

  const startCreate = () => {
    if (tab === "rules" && rulesReadOnly) {
      setErr("Fleet-managed rules are edited on the plugin vault");
      return;
    }
    setCreating(true);
    setSelected(null);
    setConfirmSha(null);
    setBody("");
    setFm(emptyFm());
    setNewPath(tab === "rules" ? "rules/new-rule.md" : tab === "docs" ? "docs/specs/new.md" : "memory/new-note.md");
    setMsg(null);
    setErr(null);
  };

  const insertWiki = (slug: string) => {
    setBody((b) => `${b}[[${slug}]]`);
    setWikiQ("");
  };

  const filteredWikis = useMemo(() => {
    const q = wikiQ.toLowerCase();
    if (!q) return wikis.slice(0, 12);
    return wikis.filter((t) => t.slug.includes(q) || t.title.toLowerCase().includes(q)).slice(0, 12);
  }, [wikiQ, wikis]);

  const save = () => {
    if (tab === "rules" && rulesReadOnly) {
      setErr("Fleet-managed rules are edited on the plugin vault — use Sync to regenerate views");
      return;
    }
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const frontmatter =
        tab === "rules"
          ? undefined
          : {
              title: fm.title,
              scope: fm.scope,
              type: fm.type,
              lifecycle: fm.lifecycle,
              status: fm.status,
              keywords: fm.keywords
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              related: [],
              updated: today(),
            };
      const relPath = creating ? newPath : selected;
      if (!relPath) {
        setErr("path required");
        return;
      }
      const r = creating
        ? await vaultCreate({ vaultId, relPath, body, frontmatter })
        : await vaultUpdate({ vaultId, relPath, body, frontmatter });
      if (!r.ok) {
        setErr((r as { error: { code: string; message: string } }).error?.message || "save failed");
        return;
      }
      setMsg(
        creating
          ? `Created ${relPath} @ ${(r as { commitSha?: string }).commitSha?.slice(0, 7)}`
          : `Updated ${relPath} @ ${(r as { commitSha?: string }).commitSha?.slice(0, 7)}`,
      );
      setCreating(false);
      refreshList();
      loadFile(relPath);
    });
  };

  const remove = () => {
    if (!selected || !confirmSha) return;
    setErr(null);
    startTransition(async () => {
      const r = await vaultDelete({
        vaultId,
        relPath: selected,
        confirmPath: selected,
        confirmSha,
      });
      if (!r.ok) {
        setErr((r as { error: { message: string } }).error?.message || "delete failed");
        return;
      }
      const w = (r as { warnings?: string[] }).warnings || [];
      setWarnings(w);
      setMsg(`Deleted ${selected}`);
      setSelected(null);
      setConfirmSha(null);
      setBody("");
      refreshList();
    });
  };

  const lifecycleSurface = tab === "docs" || tab === "memory";

  const previewLifecycle = (op: "promote" | "demote" | "supersede") => {
    if (!selected || !lifecycleSurface) return;
    setErr(null);
    setMsg(null);
    setPlanHint(null);
    setLifecyclePreview(null);
    startTransition(async () => {
      const r = await vaultLifecyclePreview({
        vaultId,
        relPath: selected,
        op,
        supersededBy: op === "supersede" ? supersededBy : undefined,
      });
      if (!r.ok) {
        setErr((r as { error: { message: string } }).error?.message || "lifecycle preview failed");
        return;
      }
      const p = r as {
        op: string;
        src: string;
        dest: string;
        planToken: string;
        tagOnly?: boolean;
      };
      setLifecyclePreview({
        op: p.op,
        src: p.src,
        dest: p.dest,
        planToken: p.planToken,
        tagOnly: p.tagOnly,
      });
      setMsg(`Preview ${p.op}: ${p.src} → ${p.dest}${p.tagOnly ? " (tag-only)" : ""}`);
    });
  };

  const applyLifecycle = () => {
    if (!selected || !lifecyclePreview) return;
    setErr(null);
    startTransition(async () => {
      const r = await vaultLifecycleApply({
        vaultId,
        relPath: selected,
        op: lifecyclePreview.op,
        planToken: lifecyclePreview.planToken,
        supersededBy:
          lifecyclePreview.op === "supersede" ? supersededBy : undefined,
      });
      if (!r.ok) {
        setErr((r as { error: { message: string } }).error?.message || "lifecycle apply failed");
        return;
      }
      const dest = (r as { dest: string }).dest;
      setMsg(
        `Lifecycle ${lifecyclePreview.op} → ${dest} @ ${(r as { commitSha?: string }).commitSha?.slice(0, 7)}`,
      );
      // T8: archiving a plan leaves docs/PLANS.md stale — the registry rebuild is a
      // SEPARATE, no-trailer commit (build-plans-registry re-derives from git). The UI
      // only hints; it never auto-runs or auto-commits.
      const archivedPlan =
        fm.type === "plan" &&
        (lifecyclePreview.op === "demote" || lifecyclePreview.op === "supersede");
      setPlanHint(
        archivedPlan
          ? "Plan archived — docs/PLANS.md is now stale. Run `node scripts/build-plans-registry.mjs` and commit it separately (no `Plan:` trailer)."
          : null,
      );
      setLifecyclePreview(null);
      refreshList();
      loadFile(dest);
    });
  };

  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Vault editor</h2>
          <p className="mt-1 text-sm text-slate-400">
            Canonical only · regenerates agent views via Sync · never writes native session memory
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ["memory", "Canonical memory"],
              ["rules", "Rules"],
              ["docs", "Docs"],
              ["dedupe", "Dedupe"],
              ["graph", "Graph memory"],
              ["pack", "Context pack"],
              ["corrections", "Corrections"],
              ["reuse", "Reuse & ADR"],
              ["sync", "Regenerate views"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`rounded border px-3 py-1 ${tab === id ? "border-emerald-600 text-emerald-300" : "border-slate-700 text-slate-400"}`}
              onClick={() => {
                setTab(id);
                setSelected(null);
                setCreating(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "memory" && (
        <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          <strong className="text-slate-300">Canonical memory</strong> (`memory/*.md`) feeds MCP +
          Studio. It does <em>not</em> change Claude&apos;s native session store (
          <code>~/.claude/projects/…/memory</code>). Memory CRUD works on every vault — including
          consumers.
        </p>
      )}

      {tab === "rules" && rulesReadOnly && (
        <p className="rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          Managed by plugin <code>rules/</code> · edit there · Regenerate via Sync.
          {pluginVaultId ? (
            <>
              {" "}
              <Link
                href={`/project/${pluginVaultId}`}
                className="font-medium text-emerald-300 underline underline-offset-2"
              >
                Open plugin Rules tab
              </Link>
            </>
          ) : null}{" "}
          Memory and Docs on this vault remain fully editable.
        </p>
      )}

      {tab === "rules" && isPluginVault && (
        <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          This vault is the <strong className="text-slate-300">fleet source</strong>. Edit here, then
          Sync (fleet mode) to push generated views to registered projects.
        </p>
      )}

      {tab === "docs" && (
        <p className="rounded border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
          Project docs CRUD is always available — fleet read-only applies only to shared rule names.
        </p>
      )}

      {tab === "sync" ? (
        <SyncPreviewPanel vaultId={vaultId} fleetTargets={fleetTargets} />
      ) : tab === "dedupe" ? (
        <DedupePanel
          vaultId={vaultId}
          onOpenPath={(relPath, nextTab) => {
            setTab(nextTab);
            setCreating(false);
            setLifecyclePreview(null);
            loadFile(relPath);
          }}
        />
      ) : tab === "graph" ? (
        <GraphMemoryPanel
          vaultId={vaultId}
          onOpenPath={(relPath, nextTab) => {
            setTab(nextTab);
            setCreating(false);
            setLifecyclePreview(null);
            loadFile(relPath);
          }}
        />
      ) : tab === "pack" ? (
        <ContextPackPanel
          vaultId={vaultId}
          onOpenPath={(relPath, nextTab) => {
            setTab(nextTab);
            setCreating(false);
            setLifecyclePreview(null);
            loadFile(relPath);
          }}
        />
      ) : tab === "corrections" ? (
        <CorrectionInboxPanel vaultId={vaultId} />
      ) : tab === "reuse" ? (
        <ReusePanel vaultId={vaultId} />
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <button
              type="button"
              className="w-full rounded border border-slate-600 px-2 py-1 text-sm text-slate-300 disabled:opacity-40"
              onClick={startCreate}
              disabled={pending || (tab === "rules" && rulesReadOnly)}
            >
              + New
            </button>
            <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
              {paths.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className={`w-full truncate rounded px-2 py-1 text-left ${selected === p ? "bg-slate-800 text-emerald-300" : "text-slate-400 hover:bg-slate-900"}`}
                    onClick={() => loadFile(p)}
                  >
                    {p.split("/").pop()}
                  </button>
                </li>
              ))}
              {!paths.length && <li className="text-slate-500">No files</li>}
            </ul>
          </div>

          <div className="space-y-3">
            {creating && (
              <label className="block text-sm">
                <span className="text-slate-400">Path</span>
                <input
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                />
              </label>
            )}

            {tab !== "rules" && (creating || selected) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["title", "Title"],
                    ["type", "Type"],
                    ["lifecycle", "Lifecycle"],
                    ["status", "Status"],
                    ["scope", "Scope"],
                    ["keywords", "Keywords (comma)"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="text-slate-400">{label}</span>
                    <input
                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                      value={fm[key]}
                      onChange={(e) => setFm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            )}

            {(creating || selected) && (
              <>
                <label className="block text-sm">
                  <span className="text-slate-400">Body</span>
                  <textarea
                    className="mt-1 min-h-48 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-sm disabled:opacity-60"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    readOnly={tab === "rules" && rulesReadOnly}
                  />
                </label>

                <div className="rounded border border-slate-800 p-2">
                  <div className="text-xs text-slate-500">Insert [[wikilink]]</div>
                  <input
                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                    placeholder="Filter slugs…"
                    value={wikiQ}
                    onChange={(e) => setWikiQ(e.target.value)}
                  />
                  <ul className="mt-1 max-h-28 overflow-y-auto text-xs">
                    {filteredWikis.map((t) => (
                      <li key={t.slug}>
                        <button
                          type="button"
                          className="text-emerald-400 hover:underline"
                          onClick={() => insertWiki(t.slug)}
                        >
                          [[{t.slug}]] — {t.title || t.path}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded bg-emerald-800 px-3 py-1 text-sm text-emerald-100 disabled:opacity-50"
                    onClick={save}
                    disabled={pending || (tab === "rules" && rulesReadOnly)}
                  >
                    {creating ? "Create + commit" : "Save + commit"}
                  </button>
                  {!creating && selected && !(tab === "rules" && rulesReadOnly) && (
                    <button
                      type="button"
                      className="rounded border border-red-900 px-3 py-1 text-sm text-red-300 disabled:opacity-50"
                      onClick={remove}
                      disabled={pending || !confirmSha}
                    >
                      Delete + commit
                    </button>
                  )}
                </div>

                {!creating && selected && lifecycleSurface && (
                  <div className="space-y-2 rounded border border-slate-800 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Lifecycle
                    </div>
                    <p className="text-xs text-slate-500">
                      Promote / demote / supersede via the shared lib (same as{" "}
                      <code>doc-update-*</code> skills). Not available on Rules.
                    </p>
                    <label className="block text-sm">
                      <span className="text-slate-400">superseded_by (for supersede)</span>
                      <input
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                        placeholder="docs/specs/replacement.md"
                        value={supersededBy}
                        onChange={(e) => setSupersededBy(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(["promote", "demote", "supersede"] as const).map((op) => (
                        <button
                          key={op}
                          type="button"
                          className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 disabled:opacity-50"
                          onClick={() => previewLifecycle(op)}
                          disabled={pending}
                        >
                          Preview {op}
                        </button>
                      ))}
                      {lifecyclePreview && (
                        <button
                          type="button"
                          className="rounded bg-slate-700 px-2 py-1 text-xs text-emerald-200 disabled:opacity-50"
                          onClick={applyLifecycle}
                          disabled={pending}
                        >
                          Apply {lifecyclePreview.op}
                        </button>
                      )}
                    </div>
                    {lifecyclePreview && (
                      <p className="font-mono text-xs text-slate-400">
                        {lifecyclePreview.src} → {lifecyclePreview.dest}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {!creating && !selected && (
              <p className="text-sm text-slate-500">Select a file or create one.</p>
            )}

            {warnings.length > 0 && (
              <p className="text-sm text-amber-300">{warnings.join(" · ")}</p>
            )}
            {msg && <p className="text-sm text-emerald-300">{msg}</p>}
            {planHint && (
              <p className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
                {planHint}
              </p>
            )}
            {err && <p className="text-sm text-red-300">{err}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
