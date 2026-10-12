import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  confirmPasswordReset,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword as firebaseUpdatePassword,
  updateProfile as firebaseUpdateAuthProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/integrations/firebase/client";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  target_role: string;
  experience_level: string;
  bio: string | null;
};

type AuthContextValue = {
  user: User | null;
  session: { access_token: string } | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<{ needsEmail: boolean }>;
  signInWithGoogle: () => Promise<{ redirected: boolean }>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readProfile(user: User): Promise<Profile> {
  const ref = doc(db, "profiles", user.uid);
  const snapshot = await getDoc(ref);
  const defaults: Profile = {
    id: user.uid,
    email: user.email,
    full_name: user.displayName,
    avatar_url: user.photoURL,
    target_role: "",
    experience_level: "",
    bio: null,
  };
  if (!snapshot.exists()) await setDoc(ref, { ...defaults, created_at: new Date().toISOString() });
  return { ...defaults, ...(snapshot.data() as Partial<Profile>) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setUser(nextUser);
    if (!nextUser) {
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const [token, nextProfile] = await Promise.all([nextUser.getIdToken(), readProfile(nextUser)]);
      setSession({ access_token: token });
      setProfile(nextProfile);
    } catch (error) {
      console.error("[auth] failed to load profile", error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }), []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await firebaseUpdateAuthProfile(credential.user, { displayName: fullName });
    await setDoc(doc(db, "profiles", credential.user.uid), {
      id: credential.user.uid,
      email,
      full_name: fullName,
      avatar_url: null,
      target_role: "",
      experience_level: "",
      bio: null,
      created_at: new Date().toISOString(),
    });
    return { needsEmail: false };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
    return { redirected: false };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/login` });
  }, []);

  const changePassword = useCallback(async (password: string) => {
    const code = new URLSearchParams(window.location.search).get("oobCode");
    if (code) {
      await confirmPasswordReset(auth, code, password);
      return;
    }
    if (!auth.currentUser) throw new Error("Not signed in");
    await firebaseUpdatePassword(auth.currentUser, password);
  }, []);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!user) throw new Error("Not signed in");
    const { full_name, avatar_url, ...fields } = patch;
    await updateDoc(doc(db, "profiles", user.uid), { ...fields, updated_at: new Date().toISOString() });
    if (full_name !== undefined || avatar_url !== undefined) {
      await firebaseUpdateAuthProfile(user, {
        ...(full_name !== undefined ? { displayName: full_name ?? undefined } : {}),
        ...(avatar_url !== undefined ? { photoURL: avatar_url ?? undefined } : {}),
      });
    }
    setProfile((current) => (current ? { ...current, ...patch } : current));
  }, [user]);

  const signOut = useCallback(async () => firebaseSignOut(auth), []);
  const value = useMemo(() => ({ user, session, profile, loading, signIn, signUp, signInWithGoogle, sendPasswordReset, updatePassword: changePassword, updateProfile, signOut }), [user, session, profile, loading, signIn, signUp, signInWithGoogle, sendPasswordReset, changePassword, updateProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside <AuthProvider>");
  return ctx;
}
