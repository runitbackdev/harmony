import type { Command, Request, Response, Stream } from "./base";
import type { ListDiff } from "./diff";

export type RoomSummary = {
  roomId: string;
  displayName: string;
  roomType: string | null;
};

export type RoomsSubscribe = Request<"h.rooms.subscribe", { spaceId: string }>;
export type RoomsSubscribed = Response<
  "h.rooms.subscribed",
  { rooms: RoomSummary[] }
>;
export type RoomsUnsubscribe = Command<
  "h.rooms.unsubscribe",
  { spaceId: string }
>;

export type RoomsUpdate = Stream<
  "h.rooms.update",
  { spaceId: string; rooms: ListDiff<RoomSummary>[] }
>;

export type RoomsRequest = RoomsSubscribe;
export type RoomsResponse = RoomsSubscribed;
export type RoomsCommand = RoomsUnsubscribe;
export type RoomsStream = RoomsUpdate;
