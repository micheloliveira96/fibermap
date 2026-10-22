const KEY = 'fibermap.initial-setup.v1';
const TTL = 60 * 60 * 1000;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function setupToken(fragment: string, storage: StorageLike, now = Date.now()) {
  const incoming = new URLSearchParams(fragment.replace(/^#/, '')).get('token');
  if (incoming && /^[A-Za-z0-9_-]{32,256}$/.test(incoming)) {
    try { storage.setItem(KEY, JSON.stringify({ token: incoming, expires: now + TTL })); } catch {}
    return incoming;
  }
  try {
    const cached = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (cached && typeof cached.token === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(cached.token) && typeof cached.expires === 'number' && cached.expires > now && cached.expires <= now + TTL) return cached.token as string;
    storage.removeItem(KEY);
  } catch { try { storage.removeItem(KEY); } catch {} }
  return '';
}
export function clearSetupToken(storage: StorageLike) { try { storage.removeItem(KEY); } catch {} }
