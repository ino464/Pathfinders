import { beforeEach, describe, expect, test, vi } from "vitest";

const fake = vi.hoisted(() => ({
  addManualChild: vi.fn(),
  updateNodeContent: vi.fn()
}));

vi.mock("../lib/graph-data", () => fake);

const { addManualChildAction, editNodeAction } =
  await import("../app/sessions/[id]/node-actions");

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
});
