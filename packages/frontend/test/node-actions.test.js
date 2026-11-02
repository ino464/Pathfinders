import { beforeEach, describe, expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({
  addManualChild: vi.fn(),
  deleteSubtree: vi.fn(),
  updateNodeContent: vi.fn(),
  updateNodeStatus: vi.fn()
}));

vi.mock("../lib/graph-data", () => fake);

const {
  addManualChildAction,
  editNodeAction,
  pruneNodeAction,
  setNodeStatusAction
} = await import("../app/sessions/[id]/node-actions");

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const NODE_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("editNodeAction", () => {
  test("trims text before updating the selected node", async () => {
    fake.updateNodeContent.mockResolvedValue({ id: NODE_ID });

    await expect(
      editNodeAction(SESSION_ID, NODE_ID, "  Edited idea  ")
    ).resolves.toEqual({ id: NODE_ID });

    expect(fake.updateNodeContent).toHaveBeenCalledWith(
      NODE_ID,
      "Edited idea"
    );
  });

  test("does not update blank text", async () => {
    await expect(
      editNodeAction(SESSION_ID, NODE_ID, "  ")
    ).resolves.toBeNull();

    expect(fake.updateNodeContent).not.toHaveBeenCalled();
  });

  test("does not update text longer than 500 characters", async () => {
    await expect(
      editNodeAction(SESSION_ID, NODE_ID, "a".repeat(501))
    ).resolves.toBeNull();

    expect(fake.updateNodeContent).not.toHaveBeenCalled();
  });
});

describe("addManualChildAction", () => {
  test("trims text before adding a child", async () => {
    fake.addManualChild.mockResolvedValue({
      nodes: [{ id: "child" }],
      edges: [{ id: "edge" }]
    });

    await expect(
      addManualChildAction(SESSION_ID, NODE_ID, "  New child  ")
    ).resolves.toEqual({
      nodes: [{ id: "child" }],
      edges: [{ id: "edge" }]
    });

    expect(fake.addManualChild).toHaveBeenCalledWith(
      SESSION_ID,
      NODE_ID,
      "New child"
    );
  });

  test("does not add blank text", async () => {
    await expect(
      addManualChildAction(SESSION_ID, NODE_ID, "  ")
    ).resolves.toBeNull();

    expect(fake.addManualChild).not.toHaveBeenCalled();
  });

  test("does not add text longer than 500 characters", async () => {
    await expect(
      addManualChildAction(SESSION_ID, NODE_ID, "a".repeat(501))
    ).resolves.toBeNull();

    expect(fake.addManualChild).not.toHaveBeenCalled();
  });
});

describe("setNodeStatusAction", () => {
  test("delegates an allowed status", async () => {
    fake.updateNodeStatus.mockResolvedValue({ id: NODE_ID });

    await expect(
      setNodeStatusAction(SESSION_ID, NODE_ID, "accepted")
    ).resolves.toEqual({ id: NODE_ID });

    expect(fake.updateNodeStatus).toHaveBeenCalledWith(
      NODE_ID,
      "accepted"
    );
  });

  test("does not delegate an unknown status", async () => {
    await expect(
      setNodeStatusAction(SESSION_ID, NODE_ID, "neutral")
    ).resolves.toBeNull();

    expect(fake.updateNodeStatus).not.toHaveBeenCalled();
  });

  test("does not delegate an invalid session id", async () => {
    await expect(
      setNodeStatusAction("not-a-uuid", NODE_ID, "accepted")
    ).resolves.toBeNull();

    expect(fake.updateNodeStatus).not.toHaveBeenCalled();
  });
});

describe("pruneNodeAction", () => {
  test("delegates a valid selected node", async () => {
    fake.deleteSubtree.mockResolvedValue([NODE_ID]);

    await expect(
      pruneNodeAction(SESSION_ID, NODE_ID)
    ).resolves.toEqual([NODE_ID]);

    expect(fake.deleteSubtree).toHaveBeenCalledWith(
      SESSION_ID,
      NODE_ID
    );
  });

  test("does not delegate an invalid node id", async () => {
    await expect(
      pruneNodeAction(SESSION_ID, "not-a-uuid")
    ).resolves.toBeNull();

    expect(fake.deleteSubtree).not.toHaveBeenCalled();
  });
});
