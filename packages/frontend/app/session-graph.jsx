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
import { layoutGraph } from "../lib/graph-layout";

function fixtureNode(id, content) {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { content, status: "pending" }
  };
}

function fixtureEdge(source, target) {
  return { id: `${source}-${target}`, source, target };
}

//hardcoded temporary graph info, in the shape getSessionGraph
//returns, until the page loads a real session
const SESSION_GRAPH_FIXTURE = {
  nodes: [
    fixtureNode(
      "question",
      "How can I make my study plan sustainable?"
    ),
    fixtureNode("time", "Protect focused study time"),
    fixtureNode("energy", "Plan around energy levels"),
    fixtureNode("support", "Build in accountability"),
    fixtureNode("calendar", "Block two 90-minute sessions"),
    fixtureNode("tasks", "Break assignments into next actions"),
    fixtureNode("morning", "Use mornings for harder work"),
    fixtureNode("check-in", "Schedule a weekly check-in")
  ],
  edges: [
    fixtureEdge("question", "time"),
    fixtureEdge("question", "energy"),
    fixtureEdge("question", "support"),
    fixtureEdge("time", "calendar"),
    fixtureEdge("time", "tasks"),
    fixtureEdge("energy", "morning"),
    fixtureEdge("support", "check-in")
  ]
};

//node positions are computed by layoutGraph on every load, and
//the stored position columns are not used (#70)
function toCanvasGraph(graph) {
  const { nodes, edges } = layoutGraph(graph);
  return {
    nodes: nodes.map((node) => ({ ...node, type: "session" })),
    edges: edges.map((edge) => ({
      ...edge,
      type: "smoothstep",
      animated: false
    }))
  };
}

function SessionNode({ data, selected }) {
  return (
    <div
      className={`session-node${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <span>{data.content}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { session: SessionNode };

export function SessionGraph({
  graph = SESSION_GRAPH_FIXTURE
}) {
  const canvasGraph = useMemo(
    () => toCanvasGraph(graph),
    [graph]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(
    canvasGraph.nodes
  );
  const [edges, , onEdgesChange] = useEdgesState(
    canvasGraph.edges
  );

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
    <section
      className="session-graph"
      aria-label="Session graph">
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
        maxZoom={1.75}>
        <Background gap={18} size={1} />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>
    </section>
  );
}
