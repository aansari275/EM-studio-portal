import { getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Reuse the already-initialised Eastern Mills app rather than making a second one.
export const auth = getAuth(getApp());

const provider = new GoogleAuthProvider();
// Only offer Eastern Mills accounts in the Google account chooser.
provider.setCustomParameters({ hd: 'easternmills.com', prompt: 'select_account' });

export const ALLOWED_DOMAIN = 'easternmills.com';
const ACCESS_DOC = doc(db, 'config', 'studio_portal_access');

export type AccessResult =
  | { ok: true }
  | { ok: false; reason: 'domain' | 'allowlist' | 'error' };

/**
 * Two gates, deliberately: the domain check is hard-coded so a mistake in the
 * Firestore config can never open the portal to outside accounts, and the
 * allowlist is stored in Firestore so people can be added without a deploy.
 */
export async function checkAccess(user: User): Promise<AccessResult> {
  const email = (user.email || '').toLowerCase();
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return { ok: false, reason: 'domain' };

  try {
    const snap = await getDoc(ACCESS_DOC);
    if (!snap.exists()) return { ok: false, reason: 'allowlist' };
    const data = snap.data() as { emails?: string[]; allowAllDomainUsers?: boolean };
    if (data.allowAllDomainUsers) return { ok: true };
    const allowed = (data.emails || []).map((e) => e.toLowerCase());
    return allowed.includes(email) ? { ok: true } : { ok: false, reason: 'allowlist' };
  } catch {
    // Fail closed — an unreachable allowlist must not grant access.
    return { ok: false, reason: 'error' };
  }
}

export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}

export function watchAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

/** Email of the signed-in studio user, or null. Used to stamp who made a catalog. */
export function currentUserEmail(): string | null {
  return auth.currentUser?.email ?? null;
}
