import { onIdTokenChanged } from 'firebase/auth';
import { auth } from './auth';
import { db } from './firebase';

/**
 * Writes for a page that is closing. The Firestore SDK's write is dropped when
 * the page unloads mid-send, so these go straight to the Firestore REST API
 * with `keepalive`, which the browser finishes after the page is gone. Same
 * approach as `saveSlideLayoutOnExit` in productEdit.ts.
 */

// The signed-in user's ID token, kept current so a write can be sent while
// the page is closing, when there is no time to fetch one.
let idToken = '';
onIdTokenChanged(auth, (u) => {
  if (!u) { idToken = ''; return; }
  u.getIdToken().then((t) => { idToken = t; }).catch(() => {});
});

type RestValue =
  | { nullValue: null } | { booleanValue: boolean } | { integerValue: string } | { doubleValue: number }
  | { stringValue: string } | { timestampValue: string }
  | { arrayValue: { values: RestValue[] } } | { mapValue: { fields: Record<string, RestValue> } };

/** A plain JS value as a Firestore REST value. Dates become timestamps. */
export function toRestValue(v: unknown): RestValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toRestValue) } };
  if (typeof v === 'object') {
    const fields: Record<string, RestValue> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) fields[k] = toRestValue(x);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

/**
 * PATCHes the named fields of one document with keepalive. `mustExist` stops
 * it creating a document that was never there. Fire and forget.
 */
export function patchOnExit(docPath: string, fields: Record<string, unknown>, mustExist = true): void {
  const { apiKey, projectId } = db.app.options;
  const keys = Object.keys(fields);
  const mask = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`
    + `?${mask}${mustExist ? '&currentDocument.exists=true' : ''}&key=${apiKey}`;
  const body = { fields: Object.fromEntries(keys.map((k) => [k, toRestValue(fields[k])])) };
  try {
    void fetch(url, {
      method: 'PATCH',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    /* nothing more can be done while the page closes */
  }
}
