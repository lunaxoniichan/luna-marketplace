import Link from "next/link";
import { notFound } from "next/navigation";
import { PluginMapGraph } from "@/components/PluginMapGraph";
import { VaultWorkspace } from "@/components/VaultWorkspace";
import {
  loadAllProjects,
  loadDocsIndex,
  loadKnowledge,
  loadPlansMarkdown,
  loadPluginGraph,
  projectHealth,
} from "@/lib/data";
import { listSyncTargets } from "@/lib/vault-gateway";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projects = loadAllProjects();
  const project = projects.find((p) => p.id === id);
  if (!project) notFound();

  const docs = loadDocsIndex(project.path);
  const graph = loadPluginGraph(project.path);
  const knowledge = loadKnowledge();
  const plans = loadPlansMarkdown(project.path);
  const health = projectHealth(project);
  const projectItems = (knowledge?.items || []).filter((i) => i.project_id === project.id);
  const syncTargets = listSyncTargets();
  const fleetTargets = syncTargets.ok
    ? (syncTargets.targets as Array<{ id: string; source: string }>)
    : projects.map((p) => ({ id: p.id, source: p.source || "registry" }));

  const byLifecycle = {
    pre_official: (docs?.docs || []).filter((d) => d.lifecycle === "pre_official"),
    official: (docs?.docs || []).filter((d) => d.lifecycle === "official"),
    post_official: (docs?.docs || []).filter((d) => d.lifecycle === "post_official"),
  };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-slate-400">
          ← Overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{project.name}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {project.source} · path <code className="text-slate-300">{project.path}</code>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(project.agents || []).map((a) => (
            <span key={a} className="badge badge-ok">
              {a}
            </span>
          ))}
          <span className="badge">{project.status}</span>
        </div>
      </div>

      <VaultWorkspace vaultId={project.id} fleetTargets={fleetTargets} />

      <section className="grid gap-4 sm:grid-cols-4">
        <div className="panel">
          <div className="text-xs uppercase text-slate-400">Docs</div>
          <div className="text-2xl font-semibold">{health.docs}</div>
        </div>
        <div className="panel">
          <div className="text-xs uppercase text-slate-400">Missing FM</div>
          <div className="text-2xl font-semibold">{health.missing_frontmatter}</div>
        </div>
        <div className="panel">
          <div className="text-xs uppercase text-slate-400">Oversize alert</div>
          <div className="text-2xl font-semibold">{health.oversize_alert}</div>
        </div>
        <div className="panel">
          <div className="text-xs uppercase text-slate-400">Broken links</div>
          <div className="text-2xl font-semibold">{health.broken_related}</div>
        </div>
      </section>

      {graph ? (
        <section className="panel">
          <h2 className="mb-3 text-lg font-medium">Plugin map</h2>
          <p className="mb-3 text-sm text-slate-400">
            {graph.counts.skills} skills · {graph.counts.phases} phases · {graph.counts.edges} edges
          </p>
          <PluginMapGraph phases={graph.workflow.phases} edges={graph.edges} />
        </section>
      ) : (
        <section className="panel">
          <h2 className="text-lg font-medium">Plugin map</h2>
          <p className="mt-2 text-sm text-slate-400">
            No <code>docs/generated/plugin-graph.json</code> for this project (expected only on the
            plugin repo).
          </p>
        </section>
      )}

      <section className="panel">
        <h2 className="mb-3 text-lg font-medium">Docs by lifecycle</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["pre_official", "PRE"],
              ["official", "OFFICIAL"],
              ["post_official", "POST"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <h3 className="mb-2 text-sm font-medium text-emerald-300">
                {label}{" "}
                <span className="badge">{byLifecycle[key].length}</span>
              </h3>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-slate-300">
                {byLifecycle[key].slice(0, 40).map((d) => (
                  <li key={d.path} className="truncate" title={d.path}>
                    <span className="text-slate-500">{d.type}</span> {d.title}
                  </li>
                ))}
                {!byLifecycle[key].length && <li className="text-slate-500">—</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="mb-3 text-lg font-medium">Knowledge browser</h2>
        <p className="mb-3 text-sm text-slate-400">
          Canonical memory + docs (indexed) · {projectItems.length} items
          {!knowledge && " (run npm run build:knowledge)"}
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Native session memory is agent-owned and not shown here — edit canonical memory in the vault
          editor above.
        </p>
        <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
          {projectItems.slice(0, 50).map((item) => (
            <li key={`${item.path}-${item.kind}`} className="rounded border border-slate-800 px-3 py-2">
              <div className="flex flex-wrap gap-2">
                <span className="badge">{item.kind}</span>
                <span className="badge">{item.lifecycle}</span>
                <span className="badge">{item.scope}</span>
              </div>
              <div className="mt-1 font-medium">{item.title}</div>
              <div className="text-xs text-slate-500">{item.path}</div>
              {item.excerpt && <p className="mt-1 text-slate-400">{item.excerpt}</p>}
            </li>
          ))}
          {!projectItems.length && <li className="text-slate-500">No knowledge items indexed.</li>}
        </ul>
      </section>

      <section className="panel">
        <h2 className="mb-3 text-lg font-medium">Plans / lessons status</h2>
        {plans ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-300">
            {plans.slice(0, 8000)}
          </pre>
        ) : (
          <p className="text-sm text-slate-400">No docs/PLANS.md</p>
        )}
      </section>
    </div>
  );
}
