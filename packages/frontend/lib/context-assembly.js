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

  // the target has to exist and not be deleted
  const target = nodeId.get(targetNodeId);
  if (!target) {
    throw new Error(`Error: Node was not found`);
  }
  if (target.deleted_at) {
    throw new Error(`Error: Node was deleted`);
  }

  // For each node, remember who its parents/children are
  const childrenOf = new Map();
  const parentsOf = new Map();

  // build the parent and child lookups from the edge list
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
  // the set only keeps one copy of each id (no duplicates)
  // Goal -> sets up a list of all nodes needed for context
  const ancestors = new Set();

  // ids we still need to look at
  // starts at current node, appends parents to the stack during while loop
  const toVisit = [targetNodeId];

  while (toVisit.length > 0) {
    // take the next id off the list
    const id = toVisit.pop();

    // if already collected, skip
    if (ancestors.has(id)) continue;

    // if node was deleted, skip
    const node = nodeId.get(id);
    if (!node || node.deleted_at) continue;

    ancestors.add(id);

    // add all of its parents to the list
    // the root has no parents, so use an empty list in that case.
    toVisit.push(...(parentsOf.get(id) ?? []));
  }

  // there has to be exactly one root (a node with no parent)
  const roots = nodes.filter((n) => !parentsOf.has(n.id));
  if (roots.length !== 1) {
    throw new Error(`Error: expected 1 root, found multiple`);
  }

  const root = roots[0];
  // if the root wasn't reached, a deleted node cut off the path to it
  if (!ancestors.has(root.id)) {
    throw new Error(`Error: no direct path to root`);
  }

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
  // if some ancestors never became ready, the graph has a cycle
  if (ordered.length !== ancestors.size) {
    throw new Error("Error: graph has a cycle");
  }

  //turn each node into a message (content)
  const messages = ordered.map((node) => ({
    // root node is the user, rest assistant
    role: node.id === root.id ? "user" : "assistant",
    content: node.content
  }));

  // only add a preferences message if there is at least one preference
  if (preferences.length > 0) {
    // sort a copy (so original unchanged)
    const sorted = [...preferences].sort(byTimeThenId);

    // put all the preference texts into one string, one per line
    const text = sorted.map((p) => p.content).join("\n");

    // add it to the front so it comes before the nodes
    messages.unshift({ role: "system", content: text });
  }

  return messages;
}
