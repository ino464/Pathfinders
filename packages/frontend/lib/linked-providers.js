const LABELS = {
  email: "Email and password",
  google: "Google"
};

// Names the sign-in methods linked to a Supabase user, once
// each. A guest has no identities, so the list is empty.
export function linkedProviders(user) {
  const providers = new Set(
    (user?.identities ?? []).map(
      (identity) => identity.provider
    )
  );
  return [...providers].map(
    (provider) => LABELS[provider] ?? provider
  );
}
