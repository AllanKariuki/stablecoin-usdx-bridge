import { createHash } from 'node:crypto';

/**
 * The payload digest: SHA-256 over a canonical JSON encoding.
 *
 * This is the entire security model of maker-checker on this platform, so it
 * is worth being precise about what it buys.
 *
 * A calling service proposes an action, computing this digest over its own
 * stored object. When the approval comes back, it computes the digest again
 * over the object *as it stands now* and compares. If anything changed in
 * between — an amount edited, a destination swapped, a beneficiary
 * substituted — the digests differ and the caller refuses to act.
 *
 * The consequence is that a compromised workflow service cannot authorize
 * anything. It can return "approved" for whatever it likes; the caller will
 * not find a matching object and will do nothing. Approval is a statement
 * about *a specific payload*, not a statement about a request id.
 *
 * That only holds if the encoding is canonical. Two encodings of the same
 * object must produce the same bytes, or an approval would spuriously fail
 * whenever a key order or a whitespace convention differed between the
 * proposing call and the verifying one — and a maker-checker system that
 * fails open under load is worse than none, because somebody will disable it.
 */

/**
 * Canonical JSON:
 *
 *  - object keys sorted by Unicode code point (JS's default string sort),
 *    recursively;
 *  - `undefined` properties dropped, matching JSON.stringify;
 *  - arrays keep their order, because order is meaning (a list of payout
 *    lines is not the same payout reordered);
 *  - no whitespace.
 *
 * Numbers are the one hazard, and this platform mostly avoids it by
 * construction: every amount crosses a service boundary as a decimal string,
 * so a payload should not contain a float at all. `canonicalize` does not
 * reject one — a digest is not the place to enforce that — but a caller that
 * puts `0.1 + 0.2` in a payload has a bigger problem than its digest.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';

  const type = typeof value;
  if (type === 'number' || type === 'boolean') return JSON.stringify(value);
  if (type === 'string') return JSON.stringify(value);
  if (type === 'undefined' || type === 'function') return 'null';

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  if (value instanceof Date) return JSON.stringify(value.toISOString());

  if (type === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }

  // BigInt and symbols. A BigInt has no JSON representation, so it is encoded
  // as the decimal string it should have been in the first place rather than
  // throwing inside a digest computation.
  return JSON.stringify(String(value));
}

/** The digest a caller stores and later re-verifies. */
export function payloadDigest(payload: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex')}`;
}

/**
 * Constant-time-ish comparison of two digests.
 *
 * Digests are public — they are returned in API responses — so a timing leak
 * here reveals nothing an attacker cannot already read. It is written this way
 * because the next person to touch it may not know that, and a `===` on a
 * secret-adjacent comparison is a habit worth not forming.
 */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
