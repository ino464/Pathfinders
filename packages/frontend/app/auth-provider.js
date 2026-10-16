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
  mergeError: null,
  continueAsGuest: async () => {},
  signInWithEmail: async () => {},
  signInWithGoogle: async () => {},
  signUpWithEmail: async () => {},
  retryMerge: async () => {},
  dismissMergeError: () => {},
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

function callbackUrl() {
  return new URL("/auth/callback", window.location.origin).toString();
}

function mergeErrorFromUrl() {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("merge_error");
}

export function AuthProvider({ children }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mergeError, setMergeError] = useState(mergeErrorFromUrl);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("merge_error")) {
      url.searchParams.delete("merge_error");
      window.history.replaceState(null, "", url);
    }
  }, []);

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

  const isGuest = Boolean(user?.is_anonymous);

  const startMerge = useCallback(async () => {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
    await postJson("/api/auth/merge/start");
  }, [supabase]);

  const finishMerge = useCallback(async () => {
    try {
      await postJson("/api/auth/merge/finish");
      setMergeError(null);
    } catch (err) {
      setMergeError(err.message);
    }
  }, []);

  const continueAsGuest = useCallback(async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }, [supabase]);

  const signInWithEmail = useCallback(
    async (email, password) => {
      if (isGuest) await startMerge();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      if (isGuest) await finishMerge();
    },
    [supabase, isGuest, startMerge, finishMerge]
  );

  const signUpWithEmail = useCallback(
    async (email, password) => {
      if (isGuest) await startMerge();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl() }
      });
      if (error) throw error;
      if (isGuest && data.session) await finishMerge();
      return { needsConfirmation: !data.session };
    },
    [supabase, isGuest, startMerge, finishMerge]
  );

  const signInWithGoogle = useCallback(async () => {
    if (isGuest) await startMerge();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() }
    });
    if (error) throw error;
  }, [supabase, isGuest, startMerge]);

  const dismissMergeError = useCallback(() => setMergeError(null), []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        mergeError,
        continueAsGuest,
        signInWithEmail,
        signInWithGoogle,
        signUpWithEmail,
        retryMerge: finishMerge,
        dismissMergeError,
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
