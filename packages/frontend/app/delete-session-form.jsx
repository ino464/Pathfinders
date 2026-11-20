"use client";

// The Delete button for one session on the home page (#123).
// `action` is the server action that deletes the session. A delete
// removes every idea in the session, so the button asks first.
export function DeleteSessionForm({ id, title, action }) {
  function confirmDelete(event) {
    const message = `Delete "${title}" and all its ideas? This cannot be undone.`;
    if (!window.confirm(message)) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={confirmDelete}>
      <input type="hidden" name="id" value={id} />
      <button type="submit">Delete</button>
    </form>
  );
}
