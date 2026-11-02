"use client";

import { useCallback, useMemo, useState } from "react";
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
import { requestExpansion } from "../lib/expand-client";
import { layoutGraph } from "../lib/graph-layout";
import { setNodeStatusAction } from "./sessions/[id]/node-actions";

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
      className={`session-node session-node--${data.status}${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <span className="session-node__label">
        {data.content}
      </span>
      <span className="session-node__detail">
        {data.status}
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { session: SessionNode };

export function SessionGraph({ graph, sessionId }) {
  const canvasGraph = useMemo(
    () => toCanvasGraph(graph),
    [graph]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(
    canvasGraph.nodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    canvasGraph.edges
  );
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const selectedNode = nodes.find(
    (node) => node.id === selectedNodeId
  );

  const selectNode = useCallback(
    (_, selectedNode) => {
      setSelectedNodeId(selectedNode.id);
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
    setSelectedNodeId(null);
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, selected: false }))
    );
  }, [setNodes]);

  async function expandSelectedNode() {
    if (!selectedNode || isExpanding) return;

    setIsExpanding(true);
    setError(null);
    try {
      const expansion = await requestExpansion(
        sessionId,
        selectedNode.id
      );
      const nextGraph = toCanvasGraph({
        nodes: [...nodes, ...expansion.nodes],
        edges: [...edges, ...expansion.edges]
      });
      setNodes(nextGraph.nodes);
      setEdges(nextGraph.edges);
    } catch (err) {
      setError(err.message ?? "The expansion failed.");
    } finally {
      setIsExpanding(false);
    }
  }

  function replaceNode(updatedNode) {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === updatedNode.id
          ? { ...updatedNode, type: "session", selected: true }
          : node
      )
    );
  }

  async function saveStatus(status) {
    if (!selectedNode || isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      const node = await setNodeStatusAction(
        sessionId,
        selectedNode.id,
        status
      );
      if (!node)
        throw new Error("The status could not be saved.");
      replaceNode(node);
    } catch (err) {
      setError(err.message ?? "The status could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-label="Session graph">
      <div
        className="session-graph__selection"
        aria-live="polite">
        {selectedNode ? (
          <p>
            Selected idea:{" "}
            <strong>{selectedNode.data.content}</strong>
          </p>
        ) : (
          <p>Select an idea to expand it.</p>
        )}
        <button
          type="button"
          onClick={expandSelectedNode}
          disabled={!selectedNode || isExpanding || isSaving}>
          {isExpanding ? "Expanding…" : "Expand"}
        </button>
        <button
          type="button"
          onClick={() => saveStatus("accepted")}
          disabled={!selectedNode || isSaving}>
          Accept
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="session-graph">
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
      </div>
    </section>
  );
}
