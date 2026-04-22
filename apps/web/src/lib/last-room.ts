const KEY_PREFIX = "harmony:last-room:";

export function getLastRoom(spaceId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_PREFIX + spaceId);
}

export function setLastRoom(spaceId: string, roomId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_PREFIX + spaceId, roomId);
}
