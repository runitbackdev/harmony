export type Request<T extends string, P = {}> = { id: string; type: T } & P;

export type Response<T extends string, P = {}> = { id: string; type: T } & P;

export type Stream<T extends string, P = {}> = { type: T } & P;

export type Command<T extends string, P = {}> = { type: T; id?: never } & P;
