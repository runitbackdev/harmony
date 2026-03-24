import type { Command, Request, Response, Stream } from "./base";
import type { ListDiff } from "./diff";

export type SpaceSummary = {
  roomId: string;
  displayName: string;
};

export type SpacesSubscribe = Request<"h.spaces.subscribe">;
export type SpacesSubscribed = Response<"h.spaces.subscribed", { spaces: SpaceSummary[] }>;
export type SpacesUnsubscribe = Command<"h.spaces.unsubscribe">;

export type SpacesUpdate = Stream<"h.spaces.update", { spaces: ListDiff<SpaceSummary>[] }>;

export type SpacesCreate = Request<"h.spaces.create", { name: string }>;
export type SpacesCreated = Response<"h.spaces.created", { space: SpaceSummary }>;

export type SpacesJoin = Request<"h.spaces.join", { spaceId: string }>;
export type SpacesJoined = Response<"h.spaces.joined", { space: SpaceSummary }>;

export type SpacesRequest = SpacesSubscribe | SpacesCreate | SpacesJoin;
export type SpacesResponse = SpacesSubscribed | SpacesCreated | SpacesJoined;
export type SpacesCommand = SpacesUnsubscribe;
export type SpacesStream = SpacesUpdate;
