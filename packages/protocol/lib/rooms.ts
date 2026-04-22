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

export type RoomsGetIds = Request<"h.rooms.getIds", { spaceId: string }>;
export type RoomsGotIds = Response<"h.rooms.gotIds", { roomIds: string[] }>;

export type RoomsUpdate = Stream<"h.rooms.update", { rooms: ListDiff<RoomSummary>[] }>;

export type ChannelVisibility = "public" | "private";

export type RoomsCreate = Request<
  "h.rooms.create",
  { spaceId: string; name: string; visibility: ChannelVisibility }
>;
export type RoomsCreated = Response<"h.rooms.created", { room: RoomSummary }>;

export type MembersGet = Request<"h.members.get", { roomId: string }>;
export type MembersGot = Response<"h.members.got", { members: MemberSummary[] }>;

export type MembersSubscribe = Request<"h.members.subscribe", { roomId: string }>;
export type MembersSubscribed = Response<"h.members.subscribed", { members: MemberSummary[] }>;
export type MembersUnsubscribe = Command<"h.members.unsubscribe", { roomId: string }>;

export type MembersUpdate = Stream<
  "h.members.update",
  { roomId: string; members: ListDiff<MemberSummary>[] }
>;

export type RoomsRequest =
  | RoomsSubscribe
  | RoomsGetIds
  | RoomsCreate
  | MembersGet
  | MembersSubscribe;
export type RoomsResponse =
  | RoomsSubscribed
  | RoomsGotIds
  | RoomsCreated
  | MembersGot
  | MembersSubscribed;
export type RoomsCommand = RoomsUnsubscribe | MembersUnsubscribe;
export type RoomsStream = RoomsUpdate | MembersUpdate;
