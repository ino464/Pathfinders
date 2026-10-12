import { describe, test } from "vitest";

// Cases for issue #27. The inputs and the expected outputs
// are in docs/context-assembly-cases.md. Issue #31 replaces
// each todo with a test.
describe("context assembly", () => {
  test.todo("case 1: root target gives one user message");
  test.todo("case 2: five levels deep gives the full path");
  test.todo("case 3a: merged node gives each ancestor once");
  test.todo("case 3b: equal created_at falls back to id");
  test.todo("case 3c: target below a merged node");
  test.todo("case 4a: preferences give one system message");
  test.todo("case 4b: preferences come before a deeper path");
  test.todo("case 4c: no preferences gives no system message");
  test.todo("case 5a: deleted target throws");
  test.todo("case 5b: deleted ancestor on only path throws");
  test.todo("case 5c: merged node excludes a deleted parent");
  test.todo("case 5d: node above a deleted node is excluded");
  test.todo("case 6: long content is not truncated");
  test.todo("case 7: rejected ancestor stays in the context");
});
