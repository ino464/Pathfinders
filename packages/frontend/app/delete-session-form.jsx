"use client";

// The Delete button for one session on the home page (#123).
// `action` is the server action that deletes the session.
export function DeleteSessionForm({ id, action }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit">Delete</button>
    </form>
  );
}
