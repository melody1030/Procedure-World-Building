import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";

/** The signed-in user (null when signed out), plus whether Firebase has reported yet. */
export function useAuth(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [ready, setReady] = useState(!auth);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setReady(true);
    });
  }, []);

  return { user, ready };
}

/** Opens the Google sign-in popup, then records the user's profile at `users/{uid}`. */
export async function signInWithGoogle(): Promise<void> {
  if (!auth || !db) return;
  const { user } = await signInWithPopup(auth, googleProvider);
  await setDoc(
    doc(db, "users", user.uid),
    { displayName: user.displayName, email: user.email, photoURL: user.photoURL, lastSignInAt: serverTimestamp() },
    { merge: true },
  );
}

export async function signOutUser(): Promise<void> {
  if (auth) await signOut(auth);
}
