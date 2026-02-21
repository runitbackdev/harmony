export type Request<T extends string, P = object> = { id: string; type: T } & P;

export type Response<T extends string, P = object> = {
  id: string;
  type: T;
} & P;

export type Stream<T extends string, P = object> = { type: T } & P;

export type Command<T extends string, P = object> = { type: T; id?: never } & P;
