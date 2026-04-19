import { Harmony } from "./client";

export const harmony = new Harmony();

export type { AuthLoginResult, AuthLogoutResult } from "./auth";
export type { EditTarget } from "./timeline";
export type { InviteLink, CreateInviteOptions, RedeemResult } from "./invites";
export { getSession } from "./session";
export { HOMESERVER_ORIGIN, HOMESERVER_URL } from "./config";
export { listenForTokenRequests } from "./media-worker";

export type { SubscribableStore } from "./store";
