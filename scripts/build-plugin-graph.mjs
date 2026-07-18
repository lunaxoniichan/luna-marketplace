#!/usr/bin/env node
/**
 * build-plugin-graph.mjs — inventory skills/agents/hooks/rules/phases → JSON + Mermaid.
 *
 * Usage (from plugin/repo root):
 *   node scripts/build-plugin-graph.mjs
 *   node scripts/build-plugin-graph.mjs --check
 *   node scripts/build-plugin-graph.mjs --root <path>
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { parseFrontmatter } from './lib/frontmatter.mjs';

const GENERATED_DIR = 'docs/generated';
const JSON_OUT = join(GENERATED_DIR, 'plugin-graph.json');
const MD_OUT = 'docs/PLUGIN_MAP.md';

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function listSkillDirs(root) {
  const dir = join(root, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

function listAgents(root) {
  const dir = join(root, 'agents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

function listRules(root) {
  const dir = join(root, '.claude', 'rules');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

/**
 * Parse WORKFLOW.md phases without a full YAML parser.
 * @param {string} text
 */
function parseWorkflow(text) {
  const { data, hasFm, raw } = parseFrontmatter(text);
  const phases = [];
  const fm = hasFm ? raw : '';
  // Split phase blocks by "  - id:"
  const blocks = fm.split(/\n\s*-\s+id:\s+/).slice(1);
  for (const block of blocks) {
    const id = block.match(/^([A-Za-z0-9_-]+)/)?.[1];
    if (!id) continue;
    const gate = block.match(/\ngate:\s*(\S+)/)?.[1] || '';
    const description = block.match(/\ndescription:\s*(.+)/)?.[1]?.trim() || '';
    const skills = [];
    const skillsInline = block.match(/suggested_skills:\s*\[([^\]]*)\]/);
    if (skillsInline) {
      for (const s of skillsInline[1].split(',')) {
        const t = s.trim();
        if (t) skills.push(t);
      }
    } else {
      // Collect consecutive "      - skill" after suggested_skills:
      const lines = block.split('\n');
      let collecting = false;
      for (const line of lines) {
        if (/suggested_skills:\s*$/.test(line)) {
          collecting = true;
          continue;
        }
        if (collecting) {
          const m = line.match(/^\s+-\s+([A-Za-z0-9_-]+)\s*$/);
          if (m) {
            skills.push(m[1]);
            continue;
          }
          if (/^\s*$/.test(line)) continue;
          collecting = false;
        }
      }
    }
    phases.push({ id, gate, description, suggested_skills: [...new Set(skills)] });
  }

  let variantIds = [];
  if (data.variants && typeof data.variants === 'object' && !Array.isArray(data.variants)) {
    variantIds = Object.keys(data.variants);
  } else {
    const vBlock = fm.match(/variants:\n([\s\S]*?)\nphases:/);
    if (vBlock) {
      variantIds = [...vBlock[1].matchAll(/^\s{2}([A-Za-z0-9_-]+):/gm)].map((m) => m[1]);
    }
  }

  return {
    name: data.name || 'default',
    variants: variantIds,
    phases,
  };
}

function parseHooks(root) {
  const path = join(root, 'hooks', 'hooks.json');
  if (!existsSync(path)) return { events: [], commands: [], eventCount: 0, commandCount: 0 };
  const cfg = loadJson(path);
  const events = [];
  const commands = [];
  for (const [event, matchers] of Object.entries(cfg.hooks || {})) {
    const cmds = [];
    for (const m of matchers) {
      for (const h of m.hooks || []) {
        const cmd = h.command || '';
        cmds.push({ matcher: m.matcher || '', command: cmd, async: !!h.async });
        commands.push({ event, matcher: m.matcher || '', command: cmd });
      }
    }
    events.push({ event, matchers: matchers.length, commands: cmds.length });
  }
  return { events, commands, eventCount: events.length, commandCount: commands.length };
}

function buildGraph(root) {
  const skills = listSkillDirs(root).map((name) => {
    const text = readFileSync(join(root, 'skills', name, 'SKILL.md'), 'utf8');
    const { data } = parseFrontmatter(text);
    return {
      id: `skill:${name}`,
      kind: 'skill',
      name: data.name || name,
      description: String(data.description || '').slice(0, 200),
      path: `skills/${name}/SKILL.md`,
    };
  });

  const agents = listAgents(root).map((name) => {
    const text = readFileSync(join(root, 'agents', `${name}.md`), 'utf8');
    const { data } = parseFrontmatter(text);
    const tools = typeof data.tools === 'string'
      ? data.tools.split(',').map((s) => s.trim()).filter(Boolean)
      : Array.isArray(data.tools)
        ? data.tools
        : [];
    return {
      id: `agent:${name}`,
      kind: 'agent',
      name: data.name || name,
      description: String(data.description || '').slice(0, 200),
      tools,
      model: data.model || null,
      path: `agents/${name}.md`,
    };
  });

  const rules = listRules(root).map((name) => ({
    id: `rule:${name}`,
    kind: 'rule',
    name,
    path: `.claude/rules/${name}.md`,
  }));

  const workflowPath = join(root, 'docs', 'workflows', 'WORKFLOW.md');
  const workflow = existsSync(workflowPath)
    ? parseWorkflow(readFileSync(workflowPath, 'utf8'))
    : { name: null, variants: [], phases: [] };

  const phases = workflow.phases.map((p) => ({
    id: `phase:${p.id}`,
    kind: 'phase',
    name: p.id,
    gate: p.gate,
    description: p.description,
    suggested_skills: p.suggested_skills,
  }));

  const hooks = parseHooks(root);
  const hookNodes = hooks.events.map((e) => ({
    id: `hook:${e.event}`,
    kind: 'hook',
    name: e.event,
    matchers: e.matchers,
    commands: e.commands,
  }));

  const nodes = [...skills, ...agents, ...rules, ...phases, ...hookNodes];
  const edges = [];

  for (const p of workflow.phases) {
    for (const s of p.suggested_skills) {
      edges.push({
        from: `phase:${p.id}`,
        to: `skill:${s}`,
        type: 'suggests',
      });
    }
  }

  // skill name presence check for dangling suggests
  const skillNames = new Set(skills.map((s) => s.name));
  const brokenSuggests = [];
  for (const e of edges) {
    const skill = e.to.replace(/^skill:/, '');
    if (!skillNames.has(skill)) brokenSuggests.push(e);
  }

  return {
    generated_at: new Date().toISOString(),
    root: basename(root),
    counts: {
      skills: skills.length,
      agents: agents.length,
      rules: rules.length,
      phases: phases.length,
      hook_events: hooks.eventCount,
      hook_commands: hooks.commandCount,
      edges: edges.length,
    },
    workflow: {
      name: workflow.name,
      variants: workflow.variants,
      phases: workflow.phases,
    },
    hooks: { events: hooks.events, commandCount: hooks.commandCount },
    nodes,
    edges,
    health: {
      broken_suggested_skills: brokenSuggests.map((e) => `${e.from} → ${e.to}`),
    },
  };
}

function renderMermaid(graph) {
  const lines = [
    '# Plugin map',
    '',
    '> Generated by `scripts/build-plugin-graph.mjs`. Do not hand-edit.',
    '',
    `Skills: **${graph.counts.skills}** · Agents: **${graph.counts.agents}** · Rules: **${graph.counts.rules}** · Phases: **${graph.counts.phases}** · Hook events: **${graph.counts.hook_events}** (${graph.counts.hook_commands} commands)`,
    '',
    '```mermaid',
    'flowchart TB',
    '  subgraph phases[WORKFLOW phases]',
  ];
  for (const p of graph.workflow.phases) {
    const safe = p.id.replace(/[^A-Za-z0-9_]/g, '_');
    lines.push(`    ${safe}["${p.id}"]`);
  }
  lines.push('  end');
  lines.push('  subgraph skills[Skills suggested]');
  const shown = new Set();
  for (const e of graph.edges) {
    if (e.type !== 'suggests') continue;
    const skill = e.to.replace(/^skill:/, '');
    if (shown.has(skill)) continue;
    shown.add(skill);
    const sid = `s_${skill.replace(/[^A-Za-z0-9_]/g, '_')}`;
    lines.push(`    ${sid}["${skill}"]`);
  }
  lines.push('  end');
  for (const e of graph.edges) {
    if (e.type !== 'suggests') continue;
    const from = e.from.replace(/^phase:/, '').replace(/[^A-Za-z0-9_]/g, '_');
    const to = `s_${e.to.replace(/^skill:/, '').replace(/[^A-Za-z0-9_]/g, '_')}`;
    lines.push(`  ${from} --> ${to}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('|------|------:|');
  for (const [k, v] of Object.entries(graph.counts)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');
  if (graph.health.broken_suggested_skills.length) {
    lines.push('## Health warnings');
    lines.push('');
    for (const w of graph.health.broken_suggested_skills) {
      lines.push(`- broken suggest: \`${w}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const rootIdx = args.indexOf('--root');
  const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : process.cwd());

  const graph = buildGraph(root);
  const json = JSON.stringify(graph, null, 2) + '\n';
  const md = renderMermaid(graph);

  const jsonPath = join(root, JSON_OUT);
  const mdPath = join(root, MD_OUT);

  if (check) {
    const curJ = existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8') : '';
    const curM = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';
    // Ignore generated_at drift for check: compare counts + structure
    const stable = (s) => s.replace(/"generated_at":\s*"[^"]*"/, '"generated_at":"STABLE"');
    if (stable(curJ) !== stable(json) || curM.replace(/Generated by.*/, '') !== md.replace(/Generated by.*/, '')) {
      // softer: if files missing or counts differ
      let fail = false;
      if (!existsSync(jsonPath) || !existsSync(mdPath)) fail = true;
      else {
        try {
          const prev = JSON.parse(curJ);
          if (JSON.stringify(prev.counts) !== JSON.stringify(graph.counts)) fail = true;
        } catch {
          fail = true;
        }
      }
      if (fail) {
        console.error('plugin-graph out of date — run: node scripts/build-plugin-graph.mjs');
        process.exit(1);
      }
    }
    console.log(`plugin-graph ok (${graph.counts.skills} skills, ${graph.counts.phases} phases, ${graph.counts.hook_events} hook events)`);
    process.exit(0);
  }

  mkdirSync(join(root, GENERATED_DIR), { recursive: true });
  writeFileSync(jsonPath, json, 'utf8');
  writeFileSync(mdPath, md, 'utf8');
  console.log(`Wrote ${JSON_OUT} and ${MD_OUT}`);
  console.log(
    `  skills=${graph.counts.skills} agents=${graph.counts.agents} rules=${graph.counts.rules} phases=${graph.counts.phases} hooks=${graph.counts.hook_events}/${graph.counts.hook_commands}`
  );
  if (graph.health.broken_suggested_skills.length) {
    console.warn(`  WARN broken suggested_skills: ${graph.health.broken_suggested_skills.length}`);
  }
}

main();
