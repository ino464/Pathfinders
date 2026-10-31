import {
  addPreferenceAction,
  removePreferenceAction
} from "../actions";

// lists a session's preferences in the order expansion uses
// them, with forms to add and remove them
export function PreferencesPanel({ sessionId, preferences }) {
  return (
    <section aria-labelledby="preferences-heading">
      <h2 id="preferences-heading">Preferences</h2>
      <p>Every expansion in this session follows these.</p>
      {preferences.length === 0 ? (
        <p role="status">No preferences yet.</p>
      ) : (
        <ul>
          {preferences.map((preference) => (
            <li key={preference.id}>
              {preference.content}
              <form action={removePreferenceAction}>
                <input
                  type="hidden"
                  name="sessionId"
                  value={sessionId}
                />
                <input
                  type="hidden"
                  name="id"
                  value={preference.id}
                />
                <button type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={addPreferenceAction}>
        <input
          type="hidden"
          name="sessionId"
          value={sessionId}
        />
        <label htmlFor="preference">New preference</label>
        <input
          id="preference"
          name="content"
          required
          maxLength={200}
        />
        <button type="submit">Add</button>
      </form>
    </section>
  );
}
