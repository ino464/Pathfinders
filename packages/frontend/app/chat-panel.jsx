function turnLabel(role) {
  return role === "assistant" ? "Pathfinders" : "You";
}

// Chat history stays in the graph's client state. This component
// only presents its current conversation state.
export function ChatPanel({
  turns = [],
  isPending = false,
  error = null
}) {
  return (
    <section aria-label="Chat conversation">
      <h2>Chat</h2>
      {turns.length === 0 ? (
        <p>
          Ask about the selected ideas to start a conversation.
        </p>
      ) : (
        <ol>
          {turns.map((turn, index) => (
            <li key={`${turn.role}-${index}`}>
              <strong>{turnLabel(turn.role)}</strong>
              <p>{turn.content}</p>
            </li>
          ))}
        </ol>
      )}
      {isPending && <p role="status">Thinking…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
