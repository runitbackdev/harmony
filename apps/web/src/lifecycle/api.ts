import { rpc } from "@harmony/core";

/** Single bridge-warming entry point. Ensures sync is running and waits
 *  until the room list + space hierarchy have populated, so subscriptions
 *  started after this returns resolve against hot state. Idempotent. */
export const warm = () => rpc("lifecycle.warm", undefined);
