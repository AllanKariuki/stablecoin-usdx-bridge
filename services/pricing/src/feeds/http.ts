/**
 * One GET with a hard timeout. Feeds deliberately do not retry: the next
 * poll replaces the observation wholesale, so a slow feed becomes a stale
 * price, never a hung poller. The AbortController makes "slow" a hard
 * bound instead of a hope.
 */
export async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`${url} returned ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
