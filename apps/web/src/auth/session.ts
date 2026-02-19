import type { Session } from "@harmony/protocol";

const STORAGE_KEY = "harmony_session";

// NOTE: We might eventually wanna use WebCrypto here to encrypt this
// for better XSS protection
export function getSession() {
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

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}
