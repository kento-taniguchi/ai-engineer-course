import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const refreshStaff = useCallback(async () => {
    if (!userId) {
      setIsStaff(false);
      return;
    }
    const { data } = await supabase.rpc("cafe_is_staff");
    setIsStaff(data === true);
  }, [userId]);

  useEffect(() => {
    refreshStaff();
  }, [refreshStaff]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    return error?.message ?? null;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  /** 戻り値：エラー文 / "confirm"（確認メール送信済み） / null（そのままログイン完了） */
  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) return error.message;
    return data.session ? null : "confirm";
  }, []);

  const signInAsGuest = useCallback(async () => {
    const { error } = await supabase.auth.signInAnonymously();
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const claimOwner = useCallback(async () => {
    const { data, error } = await supabase.rpc("cafe_claim_owner");
    if (error) return error.message;
    await refreshStaff();
    return data === true ? null : "すでに別の方が店主として登録されています。";
  }, [refreshStaff]);

  return {
    session,
    user: session?.user ?? null,
    isGuest: session?.user.is_anonymous ?? false,
    isStaff,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAsGuest,
    signOut,
    claimOwner,
  };
}

export type AuthApi = ReturnType<typeof useAuth>;
