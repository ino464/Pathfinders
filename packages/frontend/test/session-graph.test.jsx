// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from "vitest";

const fake = vi.hoisted(() => ({ requestBrainstorm: null }));

vi.mock("../lib/expand-client", () => ({
  requestBrainstorm: (...args) =>
    fake.requestBrainstorm(...args)
}));

// the server actions reach Supabase; these tests do not call them
vi.mock("../app/sessions/[id]/node-actions", () => ({
  addManualChildAction: vi.fn(),
  editNodeAction: vi.fn(),
  pruneNodeAction: vi.fn(),
  setNodeStatusAction: vi.fn()
}));

const { SessionGraph } = await import("../app/session-graph");

// React Flow measures the canvas with ResizeObserver, which jsdom
// does not have
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

function node(id, content) {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { content, status: "pending" }
  };
}

function edge(source, target) {
  return { id: `${source}-${target}`, source, target };
}

// root -> left, right, other
const GRAPH = {
  nodes: [
    node("root", "Dinner"),
    node("left", "Tacos"),
    node("right", "Sushi"),
    node("other", "Pizza")
  ],
  edges: [
    edge("root", "left"),
    edge("root", "right"),
    edge("root", "other")
  ]
};

function renderGraph() {
  render(<SessionGraph graph={GRAPH} sessionId="session-1" />);
}

function clickIdea(text, options = {}) {
  fireEvent.click(screen.getByText(text), options);
}

function selectionText() {
  return document.querySelector(".session-graph__selection > p")
    .textContent;
}

describe("SessionGraph selection", () => {
  beforeEach(() => {
    fake.requestBrainstorm = vi.fn(async () => ({
      nodes: [node("new", "Sushi tacos")],
      edges: [edge("left", "new"), edge("right", "new")]
    }));
  });

  test("a click selects one idea and enables its actions", () => {
    renderGraph();

    clickIdea("Tacos");

    expect(selectionText()).toBe("Selected idea: Tacos");
    expect(
      screen.getByRole("button", { name: "Delete branch" })
        .disabled
    ).toBe(false);
  });

  test("a selection fades the ideas outside its path", () => {
    renderGraph();
    const faded = () =>
      [
        ...document.querySelectorAll(
          ".react-flow__node.is-faded"
        )
      ]
        .map((el) => el.textContent)
        .sort();

    expect(faded()).toEqual([]);

    clickIdea("Tacos");
    expect(faded()).toEqual(["Pizza", "Sushi"]);

    clickIdea("Sushi", { shiftKey: true });
    expect(faded()).toEqual(["Pizza"]);
  });

  test("a Shift-click selects a second idea and disables the single-idea actions", () => {
    renderGraph();

    clickIdea("Tacos");
    clickIdea("Sushi", { shiftKey: true });

    expect(selectionText()).toBe(
      "Selected ideas: Tacos and Sushi"
    );
    expect(
      screen.getByRole("button", { name: "Expand" }).disabled
    ).toBe(false);
    for (const name of [
      "Flag as liked",
      "Flag as disliked",
      "Save text",
      "Add child",
      "Delete branch"
    ]) {
      expect(
        screen.getByRole("button", { name }).disabled
      ).toBe(true);
    }
  });

  test("a third Shift-click replaces the selection", () => {
    renderGraph();

    clickIdea("Tacos");
    clickIdea("Sushi", { shiftKey: true });
    clickIdea("Pizza", { shiftKey: true });

    expect(selectionText()).toBe("Selected idea: Pizza");
  });

  test("brainstorming from two ideas sends both and shows the new idea", async () => {
    renderGraph();

    clickIdea("Tacos");
    clickIdea("Sushi", { metaKey: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Expand" })
    );

    expect(await screen.findByText("Sushi tacos")).toBeTruthy();
    expect(fake.requestBrainstorm).toHaveBeenCalledWith(
      "session-1",
      ["left", "right"],
      ""
    );
  });

  test("a refused brainstorm shows the server message", async () => {
    fake.requestBrainstorm = vi.fn(async () => {
      throw new Error("Node not found in this session.");
    });
    renderGraph();

    clickIdea("Tacos");
    fireEvent.click(
      screen.getByRole("button", { name: "Expand" })
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Node not found in this session."
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Expand" }).disabled
      ).toBe(false)
    );
  });
});
