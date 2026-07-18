"use client";

import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type Phase = { id: string; gate: string; suggested_skills: string[] };

export function PluginMapGraph({
  phases,
  edges,
}: {
  phases: Phase[];
  edges: Array<{ from: string; to: string; type: string }>;
}) {
  const phaseNodes: Node[] = phases.map((p, i) => ({
    id: `phase:${p.id}`,
    position: { x: 40, y: 40 + i * 90 },
    data: { label: `${p.id}\n(${p.gate})` },
    style: {
      background: "#312e81",
      color: "#e0e7ff",
      border: "1px solid #818cf8",
      borderRadius: 8,
      padding: "8px 10px",
      fontSize: 11,
      width: 160,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));

  const skillIds = [...new Set(edges.filter((e) => e.type === "suggests").map((e) => e.to))];
  const skillNodes: Node[] = skillIds.map((id, i) => ({
    id,
    position: { x: 320, y: 20 + i * 48 },
    data: { label: id.replace(/^skill:/, "") },
    style: {
      background: "#134e4a",
      color: "#ccfbf1",
      border: "1px solid #2dd4bf",
      borderRadius: 6,
      padding: "4px 8px",
      fontSize: 11,
      width: 150,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));

  const rfEdges: Edge[] = edges
    .filter((e) => e.type === "suggests")
    .map((e, i) => ({
      id: `pe-${i}`,
      source: e.from,
      target: e.to,
      style: { stroke: "#6366f1" },
    }));

  return (
    <div className="h-[520px] w-full rounded-lg border border-slate-700 bg-slate-950">
      <ReactFlow
        nodes={[...phaseNodes, ...skillNodes]}
        edges={rfEdges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background color="#334155" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
