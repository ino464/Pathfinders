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

  // For each node, remember who its children are (the reverse of parentsOf).
  const childrenOf = new Map();

  const parentsOf = new Map();
  for (const e of edges) {
    // first time we see this child, give it an empty edge list
    if (!parentsOf.has(e.child_node_id)) {
      parentsOf.set(e.child_node_id, []);
    }
    // add this edge's parent to child list
    parentsOf.get(e.child_node_id).push(e.parent_node_id);

    // same idea, but keyed by the parent
    if (!childrenOf.has(e.parent_node_id)) {
      childrenOf.set(e.parent_node_id, []);
    }
    childrenOf.get(e.parent_node_id).push(e.child_node_id);
  }

  // collect every node before the current node (all ancestors)
  // the set only keeps one copy of each id, so a node reached by two
  // routes (like the root in a diamond) is only counted once
  // Goal : sets up a list of all nodes needed for context
  const ancestors = new Set();

  // ids we still need to look at
  // starts at current node, appends parents to the stack during while loop
  const toVisit = [targetNodeId];

  while (toVisit.length > 0) {
    // take the next id off the list
    const id = toVisit.pop();

    // if already collected, skip
    if (ancestors.has(id)) continue;

    // remember id!
    ancestors.add(id);

    // add all of its parents to the list
    // the root has no parents, so use an empty list in that case.
    toVisit.push(...(parentsOf.get(id) ?? []));
  }

  // the root is the node with no parent (or their id)
  const root = nodes.find((n) => !parentsOf.has(n.id));

  // decides which of two nodes goes first:
  // the older one, or the lower id if created same time
  const byTimeThenId = (a, b) => {
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? -1 : 1;
    }
    if (a.id !== b.id) {
      return a.id < b.id ? -1 : 1;
    }
    return 0;
  };

  // for each ancestor, count how many of its parents we haven't output yet
  // needed so node doesn't get output as soon as one of its parents does
  const waiting = new Map();
  for (const id of ancestors) {
    const parents = (parentsOf.get(id) ?? []).filter((p) =>
      ancestors.has(p)
    );
    waiting.set(id, parents.length);
  }

  // ordered = the final list, ready = nodes that can go next
  // the root is first because it has no parents to wait for
  const ordered = [];
  const ready = [root];

  while (ready.length > 0) {
    // pick the earliest node that is ready
    ready.sort(byTimeThenId);
    //not pop because we sorted shift removes and returns first item
    const next = ready.shift();
    ordered.push(next);

    // each child of that node now waits on one less parent
    for (const childId of childrenOf.get(next.id) ?? []) {
      // ignore children that aren't ancestors (other branches)
      if (!ancestors.has(childId)) continue;

      waiting.set(childId, waiting.get(childId) - 1);

      // no parents left to wait for, so this child is ready
      if (waiting.get(childId) === 0) {
        ready.push(nodeId.get(childId));
      }
    }
  }

  //turn each node into a message (content)
  return ordered.map((node) => ({
    // root node is the user, rest assistant
    role: node.id === root.id ? "user" : "assistant",
    content: node.content
  }));
}
