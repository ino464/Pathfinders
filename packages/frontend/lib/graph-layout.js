import { graphlib, layout } from "@dagrejs/dagre";

// Matches .session-node in app/globals.css: 180px wide, 0.75rem
// padding, 1px border, 0.875rem text with a 1.3 line height.
export const NODE_WIDTH = 180;
const PADDING_AND_BORDER = 2 * 12 + 2 * 1;
const LINE_HEIGHT = 14 * 1.3;
// Fewer characters than fit, because words wrap early.
const CHARS_PER_LINE = 20;

// The browser measures a node only after it renders, so the
// layout estimates the height from the length of the text.
export function estimateHeight(content) {
  const lines = Math.max(
    1,
    Math.ceil((content ?? "").length / CHARS_PER_LINE)
  );
  return Math.ceil(PADDING_AND_BORDER + lines * LINE_HEIGHT);
}

// Takes { nodes, edges } in the shape getSessionGraph returns and
// gives each node a position, left to right from the root.
// Stored positions are ignored: the layout is computed on every
// load (#70).
export function layoutGraph({ nodes, edges }) {
  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 100 });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: NODE_WIDTH,
      height: estimateHeight(node.data?.content)
    });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }
  layout(graph);

  return {
    nodes: nodes.map((node) => {
      const { x, y, width, height } = graph.node(node.id);
      // dagre gives the centre; React Flow places the top-left
      // corner.
      return {
        ...node,
        position: { x: x - width / 2, y: y - height / 2 }
      };
    }),
    edges
  };
}
