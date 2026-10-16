import { describe, expect, test } from "vitest";
import { assembleContext } from "../lib/context-assembly.js";

// Cases for issue #27. The inputs and the expected outputs
// are in docs/context-assembly-cases.md. Issue #31 replaces
// each todo with a test.

// helpers
// makes a node object as defined in the supabase table
const node = (id, content, time) => ({
  id,
  content,
  status: "pending",
  created_at: `2026-01-01T00:00:0${time}Z`,
  deleted_at: null,
});

//makes an edge object, arrow from parent to child
const edge = (parent, child) => ({
  parent_node_id: parent,
  child_node_id: child,
});

// makes a preference object, higher time = created later
const pref = (id, content, time) => ({
  id,
  content,
  created_at: `2026-01-01T00:00:0${time}Z`,
});

// copies a node and marks it deleted
const deleted = (n) => ({ ...n, deleted_at: "2026-01-01T00:00:09Z" });


describe("context assembly", () => {

  test("case 1: root target gives one user message", () => {
    // setup: set up graph with one root
    const nodes = [node("R", "Root prompt", 1)];

    // run: assembles result with only the parent root
    const result = assembleContext(nodes, [], "R");

    // check: the root becomes a user message, the content contains the prompt entered
    expect(result).toEqual([{ role: "user", content: "Root prompt" }]);
  });
  
  test("case 2: five levels deep gives the full path", () => {
    // setup: R → A → B → C → D → E, listed newest first on purpose.
    const nodes = [
      node("E", "Idea E", 6),
      node("D", "Idea D", 5),
      node("C", "Idea C", 4),
      node("B", "Idea B", 3),
      node("A", "Idea A", 2),
      node("R", "Root prompt", 1),
    ];
    const edges = [
      edge("R", "A"),
      edge("A", "B"),
      edge("B", "C"),
      edge("C", "D"),
      edge("D", "E"),
    ];

    // run: build node list 
    const result = assembleContext(nodes, edges, "E");

    // check: Root first as "user", everything else "assistant", are they all connected?
    expect(result).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      { role: "assistant", content: "Idea B" },
      { role: "assistant", content: "Idea C" },
      { role: "assistant", content: "Idea D" },
      { role: "assistant", content: "Idea E" },
    ]);
  });

  //note this test wont be live until merging exists
  test("case 3a: merged node gives each ancestor once", () => {
    // setup: R → A → M and R → B → M. M has two parents.
    const nodes = [
      node("M", "Merged idea", 4),
      node("B", "Idea B", 3),
      node("A", "Idea A", 2),
      node("R", "Root prompt", 1),
    ];
    //remember (parent, child)
    const edges = [
      edge("R", "A"),
      edge("R", "B"),
      edge("A", "M"),
      edge("B", "M"),
    ];

    // run: assemble list
    const result = assembleContext(nodes, edges, "M");

    // check: R appears once, A comes before B because it was created earlier.
    expect(result).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      { role: "assistant", content: "Idea B" },
      { role: "assistant", content: "Merged idea" },
    ]);
  });

  // this test is showing what node comes first if made at same time
  test("case 3b: equal created_at falls back to id", () => {
    // setup: same diamond, but A and B share a time (2).
    const nodes = [
      node("M", "Merged idea", 4),
      node("B", "Idea B", 2),
      node("A", "Idea A", 2),
      node("R", "Root prompt", 1),
    ];
    const edges = [
      edge("R", "A"),
      edge("R", "B"),
      edge("A", "M"),
      edge("B", "M"),
    ];
    
    // run: assemble nodes
    const result = assembleContext(nodes, edges, "M");

    // check : tie on time, so the lower id ("A") goes first.
    expect(result).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      { role: "assistant", content: "Idea B" },
      { role: "assistant", content: "Merged idea" },
    ]);
  });

  test("case 3c: target below a merged node", () => {
    // setup: diamond plus one more node: M → N. Target is N.
    const nodes = [
      node("N", "Idea N", 5),
      node("M", "Merged idea", 4),
      node("B", "Idea B", 3),
      node("A", "Idea A", 2),
      node("R", "Root prompt", 1),
    ];
    const edges = [
      edge("R", "A"),
      edge("R", "B"),
      edge("A", "M"),
      edge("B", "M"),
      edge("M", "N"),
    ];

    // run: assemble nodes
    const result = assembleContext(nodes, edges, "N");

    // check: same as 3a, with N added at the end.
    expect(result).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      { role: "assistant", content: "Idea B" },
      { role: "assistant", content: "Merged idea" },
      { role: "assistant", content: "Idea N" },
    ]);
  });

  test("case 3d: unequal branches use created_at order", () => {
    // setup: R → A → C → M and R → B → M. One is longer than the other.
    const nodes = [
      node("M", "Merged idea", 5),
      node("C", "Idea C", 4),
      node("B", "Idea B", 3),
      node("A", "Idea A", 2),
      node("R", "Root prompt", 1),
    ];
    const edges = [
      edge("R", "A"),
      edge("A", "C"),
      edge("C", "M"),
      edge("R", "B"),
      edge("B", "M"),
    ];

    // run: assemble nodes
    const result = assembleContext(nodes, edges, "M");

    // check: order is R, A, B, C, M. finishing the A branch first (R, A, C, B, M)
    // would be wrong: after A, both B and C are ready, and B is earlier
    expect(result).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      { role: "assistant", content: "Idea B" },
      { role: "assistant", content: "Idea C" },
      { role: "assistant", content: "Merged idea" },
    ]);
  });

  test("case 4a: preferences give one system message", () => {
    // setup: root only, two preferences listed newest first on purpose (prefrences optional)
    const nodes = [node("R", "Root prompt", 1)];
    const preferences = [
      pref("P2", "No ideas that need a car", 3),
      pref("P1", "Keep every suggestion low budget", 2),
    ];

    // run: preferences are the 4th argument
    const result = assembleContext(nodes, [], "R", preferences);

    // check: one system message first, oldest preference first, joined by "\n"
    expect(result).toEqual([
      {
        role: "system",
        content: "Keep every suggestion low budget\nNo ideas that need a car",
      },
      { role: "user", content: "Root prompt" },
    ]);
  });

  test("case 4b: preferences come before a deeper path", () => {
    // setup: R → A with the same two preferences.
    const nodes = [node("A", "Idea A", 2), node("R", "Root prompt", 1)];
    const edges = [edge("R", "A")];
    const preferences = [
      pref("P2", "No ideas that need a car", 3),
      pref("P1", "Keep every suggestion low budget", 2),
    ];

    // run: assemble with target A
    const result = assembleContext(nodes, edges, "A", preferences);

    // check: system message (prefrences) is still first, then the path
    expect(result).toEqual([
      {
        role: "system",
        content: "Keep every suggestion low budget\nNo ideas that need a car",
      },
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
    ]);
  });

  test("case 4c: no preferences gives no system message", () => {
    // setup: R → A, empty preferences list.
    const nodes = [node("A", "Idea A", 2), node("R", "Root prompt", 1)];
    const edges = [edge("R", "A")];

    // run: assemble with an empty list
    const result = assembleContext(nodes, edges, "A", []);

    // check: no system message at all
    expect(result).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
    ]);
  });

  test("case 5a: deleted target throws", () => {
    // setup: R → A, and A (the target) is deleted.
    const nodes = [
      deleted(node("A", "Idea A", 2)),
      node("R", "Root prompt", 1),
    ];
    const edges = [edge("R", "A")];

    // run + check: wrap the call in a function, or the throw escapes expect()
    expect(() => assembleContext(nodes, edges, "A")).toThrow();
  });

  test("case 5b: deleted ancestor on only path throws", () => {
    // setup: R → A → B, and A is deleted.
    const nodes = [
      node("B", "Idea B", 3),
      deleted(node("A", "Idea A", 2)),
      node("R", "Root prompt", 1),
    ];
    const edges = [edge("R", "A"), edge("A", "B")];

    // run + check: B is alive but its only route to the root goes through A
    expect(() => assembleContext(nodes, edges, "B")).toThrow();
  });

  test("case 5c: merged node excludes a deleted parent", () => {
    // setup: R → A → M and R → B → M, and B is deleted.
    const nodes = [
      node("M", "Merged idea", 4),
      deleted(node("B", "Idea B", 3)),
      node("A", "Idea A", 2),
      node("R", "Root prompt", 1),
    ];
    const edges = [
      edge("R", "A"),
      edge("R", "B"),
      edge("A", "M"),
      edge("B", "M"),
    ];

    // run: assemble nodes
    const result = assembleContext(nodes, edges, "M");

    // check: M is still reachable through A, so B is left out and the rest stays
    expect(result).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      { role: "assistant", content: "Merged idea" },
    ]);
  });

    test("case 5d: node above a deleted node is excluded", () => {
    // setup: R → A → M and R → X → B → M, and B is deleted. X is alive.
    const nodes = [
      node("M", "Merged idea", 6),
      deleted(node("B", "Idea B", 5)),
      node("X", "Idea X", 4),
      node("A", "Idea A", 2),
      node("R", "Root prompt", 1),
    ];
    const edges = [
      edge("R", "A"),
      edge("A", "M"),
      edge("R", "X"),
      edge("X", "B"),
      edge("B", "M"),
    ];

    // run: assemble nodes
    const result = assembleContext(nodes, edges, "M");

    // check: same as 5c. B is out because it is deleted, and X is out
    // because it only reaches M through B.
    expect(result).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      { role: "assistant", content: "Merged idea" },
    ]);
  });

  test("case 6: long content is not truncated", () => {
    // setup: same chain as case 2, but every content value is very long.
    const long = (label) => `${label} ${"word ".repeat(50000)}`;
    const nodes = [
      node("E", long("E"), 6),
      node("D", long("D"), 5),
      node("C", long("C"), 4),
      node("B", long("B"), 3),
      node("A", long("A"), 2),
      node("R", long("R"), 1),
    ];
    const edges = [
      edge("R", "A"),
      edge("A", "B"),
      edge("B", "C"),
      edge("C", "D"),
      edge("D", "E"),
    ];

    // run: assemble nodes
    const result = assembleContext(nodes, edges, "E");

    // check: still six messages, with each content exactly as it went in
    expect(result).toEqual([
      { role: "user", content: long("R") },
      { role: "assistant", content: long("A") },
      { role: "assistant", content: long("B") },
      { role: "assistant", content: long("C") },
      { role: "assistant", content: long("D") },
      { role: "assistant", content: long("E") },
    ]);
  });

  test("case 7: rejected ancestor stays in the context", () => {
    // setup: R → A → B, and A has the status "rejected".
    const nodes = [
      node("B", "Idea B", 3),
      { ...node("A", "Idea A", 2), status: "rejected" },
      node("R", "Root prompt", 1),
    ];
    const edges = [edge("R", "A"), edge("A", "B")];

    // run: assemble nodes
    const result = assembleContext(nodes, edges, "B");

    // check: the function ignores status, so A is still there
    expect(result).toEqual([
      { role: "user", content: "Root prompt" },
      { role: "assistant", content: "Idea A" },
      { role: "assistant", content: "Idea B" },
    ]);
  });

});
