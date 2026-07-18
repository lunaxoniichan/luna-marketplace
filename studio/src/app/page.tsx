import Link from "next/link";
import { ConstellationGraph } from "@/components/ConstellationGraph";
import { OverviewSummary } from "@/components/OverviewSummary";
import {
  constellationEdges,
  loadAllProjects,
  loadDocsIndex,
  loadKnowledge,
  loadPluginGraph,
  projectHealth,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default function OverviewPage() {
  const projects = loadAllProjects();
  const edges = constellationEdges(projects);
  const graph = loadPluginGraph();
  const docs = loadDocsIndex();
  const knowledge = loadKnowledge();
  const healthRows = projects.map(projectHealth);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-slate-100">User overview</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          Project constellation from <code className="text-slate-300">~/.claude/luna/registry.json</code>
          {process.env.LUNA_STUDIO_FIXTURES === "1" || process.env.LUNA_STUDIO_FIXTURES === "on"
            ? " + studio fixtures"
            : ""}
          . Indexes are rebuildable; markdown stays source of truth.
        </p>
        <div className="sr-only">
          <OverviewSummary
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              source: p.source,
              status: p.status,
              agents: p.agents,
            }))}
            edgeCount={edges.length}
          />
        </div>
      </section>

      <section className="panel">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Project map</h2>
            <p className="mt-1 text-xs text-slate-500">
              Hierarchy: kit → projects. Extra edges only for shared git submodules / module folders —
              not shared agents.
            </p>
          </div>
          <span className="badge badge-ok shrink-0">
            {projects.length} projects · {edges.length} edges
          </span>
        </div>
        <ConstellationGraph
          nodes={projects.map((p) => ({
            id: p.id,
            label: p.name,
            agents: p.agents,
            source: p.source,
            status: p.status,
          }))}
          edges={edges}
        />
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/project/${encodeURIComponent(p.id)}`}
                className="block rounded-md border border-slate-700 px-3 py-2 hover:border-emerald-600"
              >
                <div className="font-medium text-slate-100">{p.name}</div>
                <div className="text-xs text-slate-400">
                  {p.source} · {(p.agents || []).join(", ") || "no agents"} · {p.status}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="panel">
          <h3 className="text-sm uppercase tracking-wide text-slate-400">Plugin graph</h3>
          <p className="mt-2 text-3xl font-semibold text-emerald-300">{graph?.counts.skills ?? "—"}</p>
          <p className="text-sm text-slate-400">skills · {graph?.counts.phases ?? "—"} phases · {graph?.counts.hook_events ?? "—"} hook events</p>
        </div>
        <div className="panel">
          <h3 className="text-sm uppercase tracking-wide text-slate-400">Docs index</h3>
          <p className="mt-2 text-3xl font-semibold text-emerald-300">{docs?.counts.docs ?? "—"}</p>
          <p className="text-sm text-slate-400">
            pre {docs?.counts.pre_official ?? 0} · official {docs?.counts.official ?? 0} · post{" "}
            {docs?.counts.post_official ?? 0}
          </p>
        </div>
        <div className="panel">
          <h3 className="text-sm uppercase tracking-wide text-slate-400">Knowledge</h3>
          <p className="mt-2 text-3xl font-semibold text-emerald-300">{knowledge?.counts.items ?? "—"}</p>
          <p className="text-sm text-slate-400">
            items · rebuild with <code>npm run build:knowledge</code>
          </p>
        </div>
      </section>

      <section className="panel">
        <h2 className="mb-3 text-lg font-medium">Health dashboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-3">Project</th>
                <th className="py-2 pr-3">Docs</th>
                <th className="py-2 pr-3">Oversize</th>
                <th className="py-2 pr-3">Broken links</th>
                <th className="py-2 pr-3">Missing FM</th>
                <th className="py-2 pr-3">Indexes</th>
              </tr>
            </thead>
            <tbody>
              {healthRows.map((h) => (
                <tr key={h.id} className="border-t border-slate-800">
                  <td className="py-2 pr-3">
                    <Link href={`/project/${encodeURIComponent(h.id)}`}>{h.id}</Link>
                  </td>
                  <td className="py-2 pr-3">{h.docs}</td>
                  <td className="py-2 pr-3">
                    <span className={h.oversize_alert ? "badge badge-alert" : h.oversize_warn ? "badge badge-warn" : "badge"}>
                      {h.oversize_alert}A / {h.oversize_warn}W
                    </span>
                  </td>
                  <td className="py-2 pr-3">{h.broken_related}</td>
                  <td className="py-2 pr-3">{h.missing_frontmatter}</td>
                  <td className="py-2 pr-3">
                    {h.missing_indexes.length ? (
                      <span className="badge badge-warn">{h.missing_indexes.join(", ")}</span>
                    ) : (
                      <span className="badge badge-ok">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
