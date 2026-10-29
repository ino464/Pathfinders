const EXPAND_URL = "/api/expand";

// Calls the expansion endpoint from the canvas and returns its
// saved nodes and edges. Error responses become ordinary Errors
// that the interface can show to the user.
export async function requestExpansion(sessionId, nodeId) {
  const response = await fetch(EXPAND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, nodeId })
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? "The expansion failed.");
  }
  return body;
}
