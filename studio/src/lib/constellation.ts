import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export type ConstellationProject = {
  id: string;
  path: string;
  source?: string;
};

export type ConstellationEdge = {
  from: string;
  to: string;
  /** `kit` = plugin hierarchy; `submodule:<name>` = shared git submodule remote */
  label: string;
  kind: "kit" | "submodule";
};

/**
 * Parse .gitmodules into { pathBasename, url } entries.
 * Identity for overlap: prefer normalized remote URL, else path basename.
 */
export function parseGitmodules(projectPath: string): Array<{ name: string; url: string; key: string }> {
  const file = join(projectPath, ".gitmodules");
  if (!existsSync(file)) return [];
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: Array<{ name: string; url: string; key: string }> = [];
  const re = /\[submodule\s+"([^"]+)"\]\s*([\s\S]*?)(?=\[submodule|\s*$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[2];
    const path = body.match(/^\s*path\s*=\s*(.+)$/m)?.[1]?.trim();
    const url = body.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim() || "";
    if (!path) continue;
    const name = basename(path.replace(/\/$/, ""));
    const key = normalizeRemote(url) || `path:${name}`;
    out.push({ name, url, key });
  }
  return out;
}

function normalizeRemote(url: string): string {
  if (!url) return "";
  return url
    .trim()
    .replace(/\.git$/i, "")
    .replace(/^git@([^:]+):/, "https://$1/")
    .replace(/\/$/, "")
    .toLowerCase();
}

export function projectSubmoduleKeys(projectPath: string): Map<string, string> {
  const submoduleKeys = new Map<string, string>();
  for (const s of parseGitmodules(projectPath)) {
    submoduleKeys.set(s.key, s.name);
  }
  return submoduleKeys;
}

/**
 * Constellation edges — honest signal only:
 * - `kit`: plugin → every other project (hierarchy, not a discovered relation)
 * - `submodule:<name>`: shared .gitmodules remote URL (same actual repo)
 *
 * Never emits:
 * - agent co-occurrence (claude/cursor)
 * - shared child-dir names (`frontend/`, `api/`) — coincidental, not a relation
 */
export function buildConstellationEdges(projects: ConstellationProject[]): ConstellationEdge[] {
  const edges: ConstellationEdge[] = [];
  const plugin = projects.find((p) => p.source === "plugin");

  for (const p of projects) {
    if (plugin && p.id !== plugin.id) {
      edges.push({ from: plugin.id, to: p.id, label: "kit", kind: "kit" });
    }
  }

  const meta = projects.map((p) => ({
    id: p.id,
    submoduleKeys: projectSubmoduleKeys(p.path),
  }));

  for (let i = 0; i < meta.length; i++) {
    for (let j = i + 1; j < meta.length; j++) {
      const a = meta[i];
      const b = meta[j];
      for (const [key, name] of a.submoduleKeys) {
        if (b.submoduleKeys.has(key)) {
          edges.push({
            from: a.id,
            to: b.id,
            label: `submodule:${name}`,
            kind: "submodule",
          });
        }
      }
    }
  }

  return edges;
}

const ALLOWED_KINDS = new Set(["kit", "submodule"]);

/** Invariant: every edge is an allowed kind with a matching label prefix. */
export function assertHonestEdges(edges: ConstellationEdge[]): string[] {
  const problems: string[] = [];
  for (const e of edges) {
    if (!ALLOWED_KINDS.has(e.kind)) {
      problems.push(`disallowed kind ${e.kind} on ${e.from}→${e.to}`);
      continue;
    }
    if (e.kind === "kit" && e.label !== "kit") {
      problems.push(`kit edge mislabeled ${e.label}`);
    }
    if (e.kind === "submodule" && !e.label.startsWith("submodule:")) {
      problems.push(`submodule edge mislabeled ${e.label}`);
    }
    if (e.label.startsWith("module:") || e.label.startsWith("shared:") || e.label.startsWith("agents:")) {
      problems.push(`coincidental/agent label ${e.label}`);
    }
  }
  return problems;
}

/** Merge parallel edges between the same node pair for rendering (kit · submodule:X). */
export function mergeParallelEdgeLabels(
  edges: Array<{ from: string; to: string; label: string }>
): Array<{ from: string; to: string; label: string }> {
  const map = new Map<string, { from: string; to: string; labels: string[] }>();
  for (const e of edges) {
    const key = `${e.from}\0${e.to}`;
    const cur = map.get(key);
    if (!cur) map.set(key, { from: e.from, to: e.to, labels: [e.label] });
    else if (!cur.labels.includes(e.label)) cur.labels.push(e.label);
  }
  return [...map.values()].map((e) => ({
    from: e.from,
    to: e.to,
    label: e.labels.join(" · "),
  }));
}
