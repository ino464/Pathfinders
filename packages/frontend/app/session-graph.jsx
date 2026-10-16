"use client";

import { useCallback, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// This fixture deliberately keeps the canvas independent from getSessionGraph
// until the session data layer is ready. Replace SESSION_GRAPH_FIXTURE with its
// result once that work lands.
const SESSION_GRAPH_FIXTURE = {
  nodes: [
    {
      id: "question",
      label: "How might we improve student productivity?",
      detail: "root",
      level: 0
    },
    {
      id: "time-tools",
      label: "Better time management tools",
      detail: "selected",
      level: 1,
      selected: true
    },
    {
      id: "distractions",
      label: "Reduce distractions & context switching",
      detail: "0 children",
      level: 1
    },
    {
      id: "feedback",
      label: "Personalised feedback loops",
      detail: "1 child",
      level: 1
    },
    {
      id: "priorities",
      label: "Weekly priority planner",
      detail: "time tools",
      level: 2
    },
    {
      id: "focus-mode",
      label: "Focus mode reminders",
      detail: "time tools",
      level: 2
    },
    {
      id: "progress",
      label: "Progress reflection prompts",
      detail: "feedback",
      level: 2
    },
    {
      id: "check-in",
      label: "Weekly accountability check-in",
      detail: "feedback",
      level: 2
    }
  ],
  edges: [
    ["question", "time-tools"],
    ["question", "distractions"],
    ["question", "feedback"],
    ["time-tools", "priorities"],
    ["time-tools", "focus-mode"],
    ["feedback", "progress"],
    ["feedback", "check-in"]
  ]
};

// Layout decision: positions are computed when this component loads. We do not
// persist x/y coordinates yet; that schema addition is only needed when users
// can drag nodes and expect those positions to survive another session.
function layoutFixtureGraph({ nodes, edges }) {
  const byLevel = new Map();
  for (const node of nodes) {
    const levelNodes = byLevel.get(node.level) ?? [];
    levelNodes.push(node);
    byLevel.set(node.level, levelNodes);
  }

  return {
    nodes: nodes.map((node) => {
      const levelNodes = byLevel.get(node.level);
      const row = levelNodes.findIndex(({ id }) => id === node.id);

      return {
        ...node,
        type: "session",
        position: { x: node.level * 325, y: row * 130 },
        data: { label: node.label, detail: node.detail },
        selected: node.selected ?? false
      };
    }),
    edges: edges.map(([source, target]) => ({
      id: `${source}-${target}`,
      source,
      target,
      type: "smoothstep",
      animated: false
    }))
  };
}

function SessionNode({ data, selected }) {
  return (
    <div className={`session-node${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <span className="session-node__label">{data.label}</span>
      <span className="session-node__detail">{data.detail}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { session: SessionNode };

export function SessionGraph() {
  const graph = useMemo(() => layoutFixtureGraph(SESSION_GRAPH_FIXTURE), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, , onEdgesChange] = useEdgesState(graph.edges);

  const selectNode = useCallback(
    (_, selectedNode) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === selectedNode.id
        }))
      );
    },
    [setNodes]
  );

  const clearSelection = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, selected: false }))
    );
  }, [setNodes]);

  return (
    <section className="session-graph" aria-label="Session graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={selectNode}
        onPaneClick={clearSelection}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={1.75}
      >
        <Background gap={18} size={1} />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>
    </section>
  );
}
