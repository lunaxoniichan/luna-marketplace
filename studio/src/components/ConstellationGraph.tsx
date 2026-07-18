"use client";

import type { CSSProperties } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export type ConstellationNode = {
  id: string;
  label: string;
  agents: string[];
  source?: string;
  status?: string;
};

export type ConstellationEdge = {
  from: string;
  to: string;
  label: string;
};

function layout(nodes: ConstellationNode[]): Node[] {
  const n = nodes.length || 1;
  const cx = 280;
  const cy = 200;
  const r = Math.max(120, 40 * n);
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    const isPlugin = node.source === "plugin";
    const style: CSSProperties = {
      background: isPlugin ? "#1a3a2f" : "#1e293b",
      color: "#e2e8f0",
      border: isPlugin ? "2px solid #34d399" : "1px solid #475569",
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 12,
      minWidth: 120,
    };
    return {
      id: node.id,
      position: {
        x: cx + r * Math.cos(angle) - 60,
        y: cy + r * Math.sin(angle) - 20,
      },
      data: {
        label: `${node.label}\n${node.agents.join(", ") || "—"} · ${node.source || "project"}`,
      },
      style,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
}

export function ConstellationGraph({
  nodes,
  edges,
}: {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
}) {
  const rfNodes = layout(nodes);
  const rfEdges: Edge[] = edges.map((e, i) => {
    const isKit = e.label === "kit" || e.label.startsWith("kit ");
    const isSub = e.label.includes("submodule:") || e.label.includes("module:");
    return {
      id: `e-${i}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      label: e.label,
      animated: isKit && !isSub,
      style: {
        stroke: isSub ? "#38bdf8" : isKit ? "#34d399" : "#64748b",
      },
      labelStyle: { fill: "#94a3b8", fontSize: 10 },
    };
  });

  return (
    <div className="h-[420px] w-full rounded-lg border border-slate-700 bg-slate-950">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#334155" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => ((n.style as CSSProperties)?.border as string)?.includes("34d399") ? "#34d399" : "#64748b"}
          maskColor="rgba(15,23,42,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
