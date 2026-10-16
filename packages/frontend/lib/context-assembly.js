// Builds the model's message list for expanding a node. Pure function:
// no Supabase, Next, or React imports. See docs/context-assembly-cases.md.
export function assembleContext(
  nodes,
  edges,
  targetNodeId,
  preferences = []
) {
  // map and look up each node by its id instead of looping through list every time
  const nodeId = new Map(nodes.map((n) => [n.id, n]));

  const parentsOf = new Map();
  for (const e of edges) {
    // first time we see this child, give it an empty edge list
    if (!parentsOf.has(e.child_node_id)) {
      parentsOf.set(e.child_node_id, []);
    }
    // add this edge's parent to child list
    parentsOf.get(e.child_node_id).push(e.parent_node_id);
  }

  const path = [];
  let current = nodeId.get(targetNodeId);
  //while loop creates the path
  while (current) {
    path.push(current);
    //parent node (undef if doesnt exist)`
    const parents = parentsOf.get(current.id);
    // move to the first parent, if there is no parent current
    // becomes undefined and the while loop ends
    current = parents ? nodeId.get(parents[0]) : undefined;
  }
  //path is currently in reverse order (root is at the end) so we reverse
  path.reverse();

  //turn each node into a message (content)
  return path.map((node, index) => ({
    // root node is the user, rest assistant
    role: index === 0 ? "user" : "assistant",
    content: node.content
  }));
}
