import type { Command, Request, Response, Stream } from "./base";
import type { ListDiff } from "./diff";

export type RoomSummary = {
  roomId: string;
  displayName: string;
  roomType: string | null;
  unreadCount: number;
  mentionCount: number;
};

export type MemberSummary = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type SpaceFilterSummary = {
  spaceId: string;
  level: number;
  descendants: string[];
};

export type RoomsSubscribe = Request<"h.rooms.subscribe", { spaceId: string }>;
export type RoomsSubscribed = Response<"h.rooms.subscribed">;
export type RoomsUnsubscribe = Command<"h.rooms.unsubscribe", { spaceId: string }>;

export type RoomsUpdate = Stream<"h.rooms.update", { rooms: ListDiff<RoomSummary>[] }>;

export type ChannelVisibility = "public" | "private";

export type RoomsCreate = Request<
  "h.rooms.create",
  { spaceId: string; name: string; visibility: ChannelVisibility }
>;
export type RoomsCreated = Response<"h.rooms.created", { room: RoomSummary }>;

export type MembersGet = Request<"h.members.get", { roomId: string }>;
export type MembersGot = Response<"h.members.got", { members: MemberSummary[] }>;

export type RoomsRequest = RoomsSubscribe | RoomsCreate | MembersGet;
export type RoomsResponse = RoomsSubscribed | RoomsCreated | MembersGot;
export type RoomsCommand = RoomsUnsubscribe;
export type RoomsStream = RoomsUpdate;
