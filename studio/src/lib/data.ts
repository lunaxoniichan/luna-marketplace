import { buildConstellationEdges, mergeParallelEdgeLabels } from "./constellation";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export type RegistryProject = {
  id: string;
  name: string;
  path: string;
  agents: string[];
  status: string;
  registered_at?: string;
  source?: "registry" | "fixture" | "plugin";
};

export type PluginGraph = {
  generated_at: string;
  counts: Record<string, number>;
  workflow: {
    name: string;
    variants: string[];
    phases: Array<{ id: string; gate: string; suggested_skills: string[] }>;
  };
  nodes: Array<{ id: string; kind: string; name: string; description?: string }>;
  edges: Array<{ from: string; to: string; type: string }>;
  health: { broken_suggested_skills: string[] };
};

export type DocsIndex = {
  generated_at: string;
  counts: Record<string, number>;
  docs: Array<{
    path: string;
    title: string;
    type: string;
    lifecycle: string;
    status: string;
    keywords: string[];
    lines: number;
    has_frontmatter: boolean;
  }>;
  health: {
    oversize_warn: Array<{ path: string; lines: number }>;
    oversize_alert: Array<{ path: string; lines: number }>;
    broken_related: Array<{ from: string; related: string }>;
    missing_frontmatter: string[];
  };
};

export type Knowledge = {
  generated_at: string;
  registry_projects: number;
  projects: Array<{
    id: string;
    path: string;
    scope_role: string;
    item_count: number;
    modules?: string[];
  }>;
  counts: { items: number; by_kind: Record<string, number>; by_scope: Record<string, number> };
  items: Array<{
    project_id: string;
    scope: string;
    kind: string;
    path: string;
    title: string;
    lifecycle: string;
    keywords: string[];
    excerpt: string;
  }>;
};

export type ProjectHealth = {
  id: string;
  missing_indexes: string[];
  oversize_alert: number;
  oversize_warn: number;
  broken_related: number;
  missing_frontmatter: number;
  broken_suggests: number;
  docs: number;
  skills?: number;
};

function pluginRoot(): string {
  if (process.env.LUNA_PLUGIN_ROOT) return resolve(process.env.LUNA_PLUGIN_ROOT);
  return resolve(join(process.cwd(), ".."));
}

function studioRoot(): string {
  if (process.env.LUNA_STUDIO_ROOT) return resolve(process.env.LUNA_STUDIO_ROOT);
  return resolve(process.cwd());
}

export function registryDir(): string {
  if (process.env.LUNA_REGISTRY_DIR) return process.env.LUNA_REGISTRY_DIR;
  return join(homedir(), ".claude", "luna");
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function loadRegistryProjects(): RegistryProject[] {
  const path = join(registryDir(), "registry.json");
  const data = readJson<{ projects?: RegistryProject[] }>(path);
  return (data?.projects || []).map((p) => ({ ...p, source: "registry" as const }));
}

export function loadFixtureProjects(): RegistryProject[] {
  if (process.env.LUNA_STUDIO_FIXTURES !== "1" && process.env.LUNA_STUDIO_FIXTURES !== "on") {
    return [];
  }
  const fixturesDir = join(studioRoot(), "fixtures");
  if (!existsSync(fixturesDir)) return [];
  const out: RegistryProject[] = [];
  for (const name of readdirSync(fixturesDir)) {
    const path = join(fixturesDir, name);
    try {
      if (!statSync(path).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!existsSync(join(path, "AGENTS.md")) && !existsSync(join(path, "docs"))) continue;
    const agents: string[] = [];
    if (existsSync(join(path, "CLAUDE.md")) || existsSync(join(path, ".claude"))) agents.push("claude");
    if (existsSync(join(path, ".cursor"))) agents.push("cursor");
    out.push({
      id: name,
      name,
      path,
      agents,
      status: "fixture",
      source: "fixture",
    });
  }
  return out;
}

export function loadAllProjects(): RegistryProject[] {
  const byId = new Map<string, RegistryProject>();
  const plugin = pluginRoot();
  const pluginId = basename(plugin);
  byId.set(pluginId, {
    id: pluginId,
    name: pluginId,
    path: plugin,
    agents: [
      ...(existsSync(join(plugin, "CLAUDE.md")) || existsSync(join(plugin, ".claude"))
        ? ["claude"]
        : []),
      ...(existsSync(join(plugin, ".cursor")) ? ["cursor"] : []),
    ],
    status: "active",
    source: "plugin",
  });
  for (const p of loadRegistryProjects()) {
    const existing = byId.get(p.id);
    if (existing?.source === "plugin" || resolve(p.path) === resolve(plugin)) {
      byId.set(p.id, {
        ...existing!,
        ...p,
        path: plugin,
        source: "plugin",
        agents: p.agents?.length ? p.agents : existing!.agents,
      });
      continue;
    }
    byId.set(p.id, { ...p, source: "registry" });
  }
  for (const p of loadFixtureProjects()) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function loadPluginGraph(projectPath?: string): PluginGraph | null {
  const root = projectPath || pluginRoot();
  return readJson<PluginGraph>(join(root, "docs/generated/plugin-graph.json"));
}

export function loadDocsIndex(projectPath?: string): DocsIndex | null {
  const root = projectPath || pluginRoot();
  return readJson<DocsIndex>(join(root, "docs/generated/docs-index.json"));
}

export function loadKnowledge(): Knowledge | null {
  return readJson<Knowledge>(join(pluginRoot(), "docs/generated/knowledge.json"));
}

export function loadPlansMarkdown(projectPath: string): string | null {
  const p = join(projectPath, "docs/PLANS.md");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

export function projectHealth(project: RegistryProject): ProjectHealth {
  const docs = loadDocsIndex(project.path);
  const graph = loadPluginGraph(project.path);
  const missing: string[] = [];
  if (!docs) missing.push("docs-index.json");
  if (project.source === "plugin" && !graph) missing.push("plugin-graph.json");

  return {
    id: project.id,
    missing_indexes: missing,
    oversize_alert: docs?.health.oversize_alert.length ?? 0,
    oversize_warn: docs?.health.oversize_warn.length ?? 0,
    broken_related: docs?.health.broken_related.length ?? 0,
    missing_frontmatter: docs?.health.missing_frontmatter.length ?? 0,
    broken_suggests: graph?.health.broken_suggested_skills.length ?? 0,
    docs: docs?.counts.docs ?? 0,
    skills: graph?.counts.skills,
  };
}

export function constellationEdges(
  projects: RegistryProject[]
): Array<{ from: string; to: string; label: string }> {
  return mergeParallelEdgeLabels(
    buildConstellationEdges(projects).map(({ from, to, label }) => ({ from, to, label }))
  );
}

export function getPluginRoot() {
  return pluginRoot();
}
