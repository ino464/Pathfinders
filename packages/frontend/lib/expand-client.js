const EXPAND_URL = "/api/expand";

// Asks the server for new ideas from one or two selected nodes
// and returns the saved nodes and edges (#73, #94). instruction
// is the user's optional direction; an empty one is left out.
// Error responses become ordinary Errors that the interface can
// show to the user.
export async function requestBrainstorm(
  sessionId,
  nodeIds,
  instruction = ""
) {
  const request = { sessionId, nodeIds };
  const direction = instruction.trim();
  if (direction !== "") request.instruction = direction;

  const response = await fetch(EXPAND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? "The expansion failed.");
  }
  return body;
}
