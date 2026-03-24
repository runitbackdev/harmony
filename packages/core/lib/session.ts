import type { Session } from "@harmony/protocol";

const STORAGE_KEY = "harmony_session";

export function getSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function setSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export async function clearSession() {
  localStorage.removeItem(STORAGE_KEY);

  const [registrations, cacheKeys] = await Promise.all([
    navigator.serviceWorker.getRegistrations(),
    caches.keys(),
  ]);

  await Promise.all([
    ...registrations.map((r) => r.unregister()),
    ...cacheKeys.map((k) => caches.delete(k)),
  ]);
}
