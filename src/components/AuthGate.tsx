import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { checkAccess, signInWithGoogle, signOutUser, watchAuth, ALLOWED_DOMAIN } from '../lib/auth';

type State =
  | { phase: 'loading' }
  | { phase: 'signedOut'; error?: string }
  | { phase: 'denied'; email: string; reason: 'domain' | 'allowlist' | 'error' }
  | { phase: 'ready'; user: User };

const DENIED_COPY: Record<'domain' | 'allowlist' | 'error', string> = {
  domain: `Only @${ALLOWED_DOMAIN} accounts can use this portal.`,
  allowlist: 'This account is not on the studio portal access list. Ask Abdul to add you.',
  error: 'Could not verify access. Check your connection and try again.',
};

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(
    () =>
      watchAuth(async (user) => {
        if (!user) return setState({ phase: 'signedOut' });
        const result = await checkAccess(user);
        if (result.ok) return setState({ phase: 'ready', user });
        // Do not leave a rejected account holding a session.
        await signOutUser().catch(() => {});
        setState({ phase: 'denied', email: user.email || '', reason: result.reason });
      }),
    []
  );

  if (state.phase === 'ready') return <>{children}</>;

  if (state.phase === 'loading') {
    return (
      <Shell>
        <p className="text-sm text-neutral-500">Checking access…</p>
      </Shell>
    );
  }

  const denied = state.phase === 'denied' ? state : null;
  return (
    <Shell>
      {denied && (
        <div className="mb-6 rounded-md bg-red-50 px-4 py-3 text-left">
          <p className="text-sm font-medium text-red-800">{denied.email}</p>
          <p className="mt-1 text-sm text-red-700">{DENIED_COPY[denied.reason]}</p>
        </div>
      )}
      <button
        onClick={() =>
          signInWithGoogle().catch((e) =>
            setState({ phase: 'signedOut', error: e?.message || 'Sign-in failed' })
          )
        }
        className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Sign in with Google
      </button>
      {state.phase === 'signedOut' && state.error && (
        <p className="mt-3 text-sm text-red-600">{state.error}</p>
      )}
      <p className="mt-6 text-xs text-neutral-400">
        Eastern Mills accounts only
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold tracking-wide text-neutral-900">EASTERN MILLS</h1>
        <p className="mt-1 mb-8 text-sm text-neutral-500">Studio Portal</p>
        {children}
      </div>
    </div>
  );
}
