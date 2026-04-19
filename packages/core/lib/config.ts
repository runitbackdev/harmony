export const HOMESERVER_URL = import.meta.env.VITE_HOMESERVER_URL ?? "https://chat.lycanthropy.dev";

export const HOMESERVER_ORIGIN = new URL(HOMESERVER_URL).origin;
