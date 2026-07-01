export const HOMESERVER_URL = import.meta.env.VITE_HOMESERVER_URL ?? "http://localhost:8008";

export const HOMESERVER_ORIGIN = new URL(HOMESERVER_URL).origin;
