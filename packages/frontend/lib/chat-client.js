const CHAT_URL = "/api/chat";

// Sends only client-held turns. The server validates the selected
// nodes, recent history, and new message against the chat contract.
export async function requestChat(
  sessionId,
  nodeIds,
  history,
  message
) {
  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      nodeIds,
      history,
      message
    })
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error ?? "The chat reply failed.");
  }
  return body.reply;
}
