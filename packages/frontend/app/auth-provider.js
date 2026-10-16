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
  signUpWithEmail: async () => {},
  addEmailToGuest: async () => {},
  setPassword: async () => {},
  signOut: async () => {}
});

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

  const signInWithEmail = useCallback(
    async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
    },
    [supabase]
  );

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
