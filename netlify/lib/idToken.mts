import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/**
 * Verify a Firebase ID token without a service account: the token is an RS256
 * JWT signed by Google's securetoken keys, published as X.509 certs. Checks
 * the signature, audience and issuer (project easternmillscom), expiry, issue
 * time and subject, the same checks firebase-admin's verifyIdToken makes
 * (it does not check revocation unless asked, and neither does this).
 */
const PROJECT = 'easternmillscom';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cache: { keys: Map<string, KeyObject>; until: number } | null = null;

async function keys(): Promise<Map<string, KeyObject>> {
  if (cache && cache.until > Date.now()) return cache.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const json = (await res.json()) as Record<string, string>;
  const age = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1]) || 3600;
  const map = new Map<string, KeyObject>();
  for (const [kid, pem] of Object.entries(json)) map.set(kid, createPublicKey(pem));
  cache = { keys: map, until: Date.now() + Math.min(age, 6 * 3600) * 1000 };
  return map;
}

const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export interface TokenUser { uid: string; email: string; emailVerified: boolean }

/** The user, or a reason it was refused. Never throws for a bad token. */
export async function verifyIdToken(token: string): Promise<{ ok: true; user: TokenUser } | { ok: false; reason: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(b64(parts[0]).toString('utf8'));
    claims = JSON.parse(b64(parts[1]).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'alg' };
  const key = (await keys()).get(header.kid);
  if (!key) return { ok: false, reason: 'kid' };
  const good = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64(parts[2]));
  if (!good) return { ok: false, reason: 'signature' };
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== PROJECT) return { ok: false, reason: 'aud' };
  if (claims.iss !== `https://securetoken.google.com/${PROJECT}`) return { ok: false, reason: 'iss' };
  if (typeof claims.exp !== 'number' || claims.exp <= now) return { ok: false, reason: 'expired' };
  if (typeof claims.iat !== 'number' || claims.iat > now + 300) return { ok: false, reason: 'iat' };
  if (typeof claims.sub !== 'string' || !claims.sub) return { ok: false, reason: 'sub' };
  return {
    ok: true,
    user: { uid: claims.sub, email: String(claims.email || '').toLowerCase(), emailVerified: claims.email_verified === true },
  };
}
