export const MAX_SELECTED = 2;

// Returns the selected ids after a click on a node (#94). A plain
// click selects only that node. An additive click (Shift, Cmd or
// Ctrl) removes the node when it is selected, starts a new
// selection when MAX_SELECTED nodes are selected, and otherwise
// adds the node.
export function nextSelection(selectedIds, nodeId, additive) {
  if (!additive) return [nodeId];
  if (selectedIds.includes(nodeId)) {
    return selectedIds.filter((id) => id !== nodeId);
  }
  if (selectedIds.length >= MAX_SELECTED) return [nodeId];
  return [...selectedIds, nodeId];
}

export function sameSelection(a, b) {
  return (
    a.length === b.length && a.every((id, i) => id === b[i])
  );
}
