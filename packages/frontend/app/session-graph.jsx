"use client";

import { useMemo, useState } from "react";
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
import { requestBrainstorm } from "../lib/expand-client";
import { highlightSelection } from "../lib/graph-highlight";
import { layoutGraph } from "../lib/graph-layout";
import { FLAGS, nextFlagStatus } from "../lib/node-status";
import { useNodeSelection } from "./use-node-selection";
import {
  addManualChildAction,
  editNodeAction,
  pruneNodeAction,
  setNodeStatusAction
} from "./sessions/[id]/node-actions";

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

//a liked or disliked node shows a stripe along its top, and a
//pending node shows none (#91)
function SessionNode({ data, selected }) {
  const flag = FLAGS[data.status];
  return (
    <div
      className={`session-node${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      {flag && (
        <span
          className={`session-node__stripe session-node__stripe--${data.status}`}
          role="img"
          aria-label={flag}
          title={flag}
        />
      )}
      <span className="session-node__label">
        {data.content}
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
  const [isExpanding, setIsExpanding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nodeText, setNodeText] = useState("");
  const [childText, setChildText] = useState("");
  const [error, setError] = useState(null);
  const { selectedIds, clickNode, clear } =
    useNodeSelection(resetForms);
  const selectedNodes = selectedIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter(Boolean);
  // the single-node actions need exactly one selected node
  const selectedNode =
    selectedNodes.length === 1 ? selectedNodes[0] : null;
  const isBusy = isExpanding || isSaving;

  // the selection's ancestors and children stay clear, and the
  // other ideas and edges fade
  const highlight = useMemo(
    () => highlightSelection(edges, selectedIds),
    [edges, selectedIds]
  );

  // React Flow draws a node as selected from its `selected`
  // field, so the field follows the selection hook
  const canvasNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        selected: selectedIds.includes(node.id),
        className:
          highlight && !highlight.nodeIds.has(node.id)
            ? "is-faded"
            : undefined
      })),
    [nodes, selectedIds, highlight]
  );

  // Highlighted edges come last, so React Flow draws them above
  // the faded edges. A zIndex would also lift them above the
  // nodes and draw a line across an idea's text.
  const canvasEdges = useMemo(() => {
    if (!highlight) return edges;
    const faded = [];
    const highlighted = [];
    for (const edge of edges) {
      if (highlight.edgeIds.has(edge.id)) {
        highlighted.push({
          ...edge,
          className: "is-highlighted"
        });
      } else {
        faded.push({ ...edge, className: "is-faded" });
      }
    }
    return [...faded, ...highlighted];
  }, [edges, highlight]);

  function resetForms(ids) {
    const single =
      ids.length === 1
        ? nodes.find((node) => node.id === ids[0])
        : null;
    setNodeText(single?.data.content ?? "");
    setChildText("");
    setError(null);
  }

  function selectNode(event, node) {
    clickNode(
      node.id,
      event.shiftKey || event.metaKey || event.ctrlKey
    );
  }

  // Creates new ideas from the one or two selected nodes. With
  // two, every new idea has both as parents (#73). The composer
  // (#72) passes the typed text as the instruction.
  async function brainstorm(instruction = "") {
    if (selectedNodes.length === 0 || isBusy) return;

    setIsExpanding(true);
    setError(null);
    try {
      const expansion = await requestBrainstorm(
        sessionId,
        selectedNodes.map((node) => node.id),
        instruction
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
          ? { ...updatedNode, type: "session" }
          : node
      )
    );
  }

  async function saveStatus(status) {
    if (!selectedNode || isBusy) return;

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

  async function editSelectedNode(event) {
    event.preventDefault();
    if (!selectedNode || isBusy) return;

    setIsSaving(true);
    setError(null);
    try {
      const node = await editNodeAction(
        sessionId,
        selectedNode.id,
        nodeText
      );
      if (!node)
        throw new Error("The node text could not be saved.");
      replaceNode(node);
      setNodeText(node.data.content);
    } catch (err) {
      setError(
        err.message ?? "The node text could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function addManualChild(event) {
    event.preventDefault();
    if (!selectedNode || isBusy) return;

    setIsSaving(true);
    setError(null);
    try {
      const addition = await addManualChildAction(
        sessionId,
        selectedNode.id,
        childText
      );
      if (!addition)
        throw new Error("The child could not be added.");
      const nextGraph = toCanvasGraph({
        nodes: [...nodes, ...addition.nodes],
        edges: [...edges, ...addition.edges]
      });
      setNodes(nextGraph.nodes);
      setEdges(nextGraph.edges);
      setChildText("");
    } catch (err) {
      setError(err.message ?? "The child could not be added.");
    } finally {
      setIsSaving(false);
    }
  }

  async function pruneSelectedNode() {
    if (!selectedNode || isBusy) return;
    if (
      !window.confirm("Delete this idea and its descendants?")
    ) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const deletedIds = await pruneNodeAction(
        sessionId,
        selectedNode.id
      );
      if (!deletedIds)
        throw new Error("The branch could not be deleted.");
      const deleted = new Set(deletedIds);
      setNodes((currentNodes) =>
        currentNodes.filter((node) => !deleted.has(node.id))
      );
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) =>
            !deleted.has(edge.source) &&
            !deleted.has(edge.target)
        )
      );
      clear();
    } catch (err) {
      setError(
        err.message ?? "The branch could not be deleted."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-label="Session graph">
      <div
        className="session-graph__selection"
        aria-live="polite">
        {selectedNodes.length === 2 ? (
          <p>
            Selected ideas:{" "}
            <strong>{selectedNodes[0].data.content}</strong> and{" "}
            <strong>{selectedNodes[1].data.content}</strong>
          </p>
        ) : selectedNode ? (
          <p>
            Selected idea:{" "}
            <strong>{selectedNode.data.content}</strong>
          </p>
        ) : (
          <p>
            Select an idea to expand it. Shift-click a second
            idea to combine the two.
          </p>
        )}
        <button
          type="button"
          onClick={() => brainstorm()}
          disabled={selectedNodes.length === 0 || isBusy}>
          {isExpanding ? "Expanding…" : "Expand"}
        </button>
        <fieldset className="session-graph__markers">
          <legend>Markers</legend>
          {Object.entries(FLAGS).map(([status, flag]) => (
            <button
              key={status}
              type="button"
              className={`flag-toggle flag-toggle--${status}`}
              aria-label={`Flag as ${flag.toLowerCase()}`}
              aria-pressed={
                selectedNode?.data.status === status
              }
              title={flag}
              onClick={() =>
                saveStatus(
                  nextFlagStatus(
                    selectedNode.data.status,
                    status
                  )
                )
              }
              disabled={!selectedNode || isBusy}>
              ⚑
            </button>
          ))}
        </fieldset>
        <form onSubmit={editSelectedNode}>
          <label>
            Edit idea
            <input
              value={nodeText}
              onChange={(event) =>
                setNodeText(event.target.value)
              }
              disabled={!selectedNode || isBusy}
              maxLength={500}
              required
            />
          </label>
          <button
            type="submit"
            disabled={!selectedNode || isBusy}>
            Save text
          </button>
        </form>
        <form onSubmit={addManualChild}>
          <label>
            Add child
            <input
              value={childText}
              onChange={(event) =>
                setChildText(event.target.value)
              }
              disabled={!selectedNode || isBusy}
              maxLength={500}
              required
            />
          </label>
          <button
            type="submit"
            disabled={!selectedNode || isBusy}>
            Add child
          </button>
        </form>
        <button
          type="button"
          onClick={pruneSelectedNode}
          disabled={!selectedNode || isBusy}>
          Delete branch
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="session-graph">
        {/* the selection hook owns selection, so React Flow's
            own click, Shift-drag box and Backspace removal are
            off */}
        <ReactFlow
          nodes={canvasNodes}
          edges={canvasEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={selectNode}
          onPaneClick={clear}
          elementsSelectable={false}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          deleteKeyCode={null}
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
