// Returns the nodes and edges to highlight for a selection on
// the canvas (#94): the selected nodes, all their ancestors and
// their direct children, which is what a brainstorm sends to the
// model (the context path and the "do not repeat" list). Edges
// use React Flow's source and target. Returns null when nothing
// is selected, so nothing is faded.
export function highlightSelection(edges, selectedIds) {
  if (selectedIds.length === 0) return null;

  const parentsOf = new Map();
  for (const edge of edges) {
    if (!parentsOf.has(edge.target)) {
      parentsOf.set(edge.target, []);
    }
    parentsOf.get(edge.target).push(edge.source);
  }

  const path = new Set();
  const toVisit = [...selectedIds];
  while (toVisit.length > 0) {
    const id = toVisit.pop();
    if (path.has(id)) continue;
    path.add(id);
    toVisit.push(...(parentsOf.get(id) ?? []));
  }

  const selected = new Set(selectedIds);
  const nodeIds = new Set(path);
  const edgeIds = new Set();
  for (const edge of edges) {
    // an edge inside the path joins two ideas of the context;
    // an edge out of a selected node leads to a child
    if (path.has(edge.target) && path.has(edge.source)) {
      edgeIds.add(edge.id);
    } else if (selected.has(edge.source)) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.target);
    }
  }

  return { nodeIds, edgeIds };
}
