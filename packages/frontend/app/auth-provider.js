"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import { createClient } from "../lib/supabase";

const AuthContext = createContext({
  user: null,
  loading: true,
  continueAsGuest: async () => {},
  signInWithEmail: async () => {},
  signInWithGoogle: async () => {},
  linkGoogleToGuest: async () => {},
  signUpWithEmail: async () => {},
  addEmailToGuest: async () => {},
  setPassword: async () => {},
  signOut: async () => {}
});

async function postJson(path) {
  const response = await fetch(path, { method: "POST" });
  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }
  const body = await response.json().catch(() => ({}));
  throw new Error(body.error ?? `Request to ${path} failed.`);
}

function callbackUrl(next) {
  const url = new URL("/auth/callback", window.location.origin);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

export function AuthProvider({ children }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const continueAsGuest = useCallback(async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }, [supabase]);

  const isGuest = Boolean(user?.is_anonymous);

  const startMerge = useCallback(async () => {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
    await postJson("/api/auth/merge/start");
  }, [supabase]);

  const signInWithEmail = useCallback(
    async (email, password) => {
      if (isGuest) await startMerge();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      if (isGuest) await postJson("/api/auth/merge/finish");
    },
    [supabase, isGuest, startMerge]
  );

  const signInWithGoogle = useCallback(async () => {
    if (isGuest) await startMerge();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() }
    });
    if (error) throw error;
  }, [supabase, isGuest, startMerge]);

  const linkGoogleToGuest = useCallback(async () => {
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: callbackUrl() }
    });
    if (error) throw error;
  }, [supabase]);

  const signUpWithEmail = useCallback(
    async (email, password) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl() }
      });
      if (error) throw error;
      return { needsConfirmation: !data.session };
    },
    [supabase]
  );

  const addEmailToGuest = useCallback(
    async (email) => {
      const { error } = await supabase.auth.updateUser(
        { email },
        { emailRedirectTo: callbackUrl("/set-password") }
      );
      if (error?.code === "email_exists") {
        throw new Error(
          'That email already has an account. Choose "I already have an account" to sign in and bring your guest work with you.'
        );
      }
      if (error) throw error;
    },
    [supabase]
  );

  const setPassword = useCallback(
    async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        continueAsGuest,
        signInWithEmail,
        signInWithGoogle,
        linkGoogleToGuest,
        signUpWithEmail,
        addEmailToGuest,
        setPassword,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
