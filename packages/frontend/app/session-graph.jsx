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

//hardcoded temporary graph info
const SESSION_GRAPH_FIXTURE = {
  nodes: [
    { id: "question", label: "How can I make my study plan sustainable?", level: 0 },
    { id: "time", label: "Protect focused study time", level: 1 },
    { id: "energy", label: "Plan around energy levels", level: 1 },
    { id: "support", label: "Build in accountability", level: 1 },
    { id: "calendar", label: "Block two 90-minute sessions", level: 2 },
    { id: "tasks", label: "Break assignments into next actions", level: 2 },
    { id: "morning", label: "Use mornings for harder work", level: 2 },
    { id: "check-in", label: "Schedule a weekly check-in", level: 2 }
  ],
  edges: [
    ["question", "time"],
    ["question", "energy"],
    ["question", "support"],
    ["time", "calendar"],
    ["time", "tasks"],
    ["energy", "morning"],
    ["support", "check-in"]
  ]
};

//now: node positions are calculated when the graph loads.
// X/Y positions could be saved in the database later if users need to move nodes and keep their changes :)    
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
        position: { x: node.level * 310, y: row * 155 },
        data: { label: node.label }
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
      <span>{data.label}</span>
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
