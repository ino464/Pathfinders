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

const fake = vi.hoisted(() => ({
  requestBrainstorm: null,
  requestChat: null
}));

vi.mock("../lib/chat-client", () => ({
  requestChat: (...args) => fake.requestChat(...args)
}));

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
const { setNodeStatusAction } =
  await import("../app/sessions/[id]/node-actions");

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

function canvasNode(text) {
  return screen
    .getAllByText(text)
    .map((el) => el.closest(".react-flow__node"))
    .find(Boolean);
}

function selectBrainstormMode() {
  fireEvent.click(
    screen.getByRole("button", { name: "Brainstorm" })
  );
}

describe("SessionGraph selection", () => {
  beforeEach(() => {
    fake.requestBrainstorm = vi.fn(async () => ({
      nodes: [node("new", "Sushi tacos")],
      edges: [edge("left", "new"), edge("right", "new")]
    }));
    fake.requestChat = vi.fn(
      async () => "They are both dinners."
    );
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

  test("a Shift-click selects a second idea and enables brainstorm", () => {
    renderGraph();

    clickIdea("Tacos");
    clickIdea("Sushi", { shiftKey: true });
    selectBrainstormMode();

    expect(selectionText()).toBe(
      "Selected ideas: Tacos and Sushi"
    );
    expect(
      screen.getByRole("button", { name: "Send" }).disabled
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

  test("a liked idea keeps its place on the canvas", async () => {
    // the saved node comes back with the stored position, which
    // is empty
    setNodeStatusAction.mockResolvedValueOnce({
      id: "left",
      position: { x: 0, y: 0 },
      data: { content: "Tacos", status: "accepted" }
    });
    renderGraph();
    clickIdea("Tacos");
    const before = canvasNode("Tacos").style.transform;

    fireEvent.click(
      screen.getByRole("button", { name: "Flag as liked" })
    );

    await waitFor(() =>
      expect(
        canvasNode("Tacos").querySelector(
          ".session-node__stripe--accepted"
        )
      ).toBeTruthy()
    );
    expect(canvasNode("Tacos").style.transform).toBe(before);
  });

  test("brainstorming from two ideas sends both and shows the new idea", async () => {
    renderGraph();

    clickIdea("Tacos");
    clickIdea("Sushi", { metaKey: true });
    selectBrainstormMode();
    fireEvent.click(
      screen.getByRole("button", { name: "Send" })
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
    selectBrainstormMode();
    fireEvent.click(
      screen.getByRole("button", { name: "Send" })
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Node not found in this session."
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send" }).disabled
      ).toBe(false)
    );
  });

  test("a chat turn sends the selected node and leaves the canvas unchanged", async () => {
    renderGraph();
    clickIdea("Tacos");
    const nodeCount = document.querySelectorAll(
      ".react-flow__node"
    ).length;

    fireEvent.change(screen.getByLabelText("Chat message"), {
      target: { value: "How does this fit?" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send" })
    );

    expect(
      await screen.findByText("They are both dinners.")
    ).toBeTruthy();
    expect(fake.requestChat).toHaveBeenCalledWith(
      "session-1",
      ["left"],
      [],
      "How does this fit?"
    );
    expect(
      document.querySelectorAll(".react-flow__node").length
    ).toBe(nodeCount);
  });
});
