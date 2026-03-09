import type { Command, Request, Response, Stream } from "./base";
import type { ListDiff } from "./diff";

export type RoomSummary = {
  roomId: string;
  displayName: string;
  roomType: string | null;
};

export type SpaceFilterSummary = {
  spaceId: string;
  level: number;
  descendants: string[];
};

export type RoomsSubscribe = Request<"h.rooms.subscribe", { spaceId: string }>;
export type RoomsSubscribed = Response<"h.rooms.subscribed">;
export type RoomsUnsubscribe = Command<
  "h.rooms.unsubscribe",
  { spaceId: string }
>;

export type RoomsUpdate = Stream<
  "h.rooms.update",
  { rooms: ListDiff<RoomSummary>[] }
>;

export type RoomsCreate = Request<
  "h.rooms.create",
  { spaceId: string; name: string }
>;
export type RoomsCreated = Response<"h.rooms.created", { room: RoomSummary }>;

export type RoomsRequest = RoomsSubscribe | RoomsCreate;
export type RoomsResponse = RoomsSubscribed | RoomsCreated;
export type RoomsCommand = RoomsUnsubscribe;
export type RoomsStream = RoomsUpdate;
