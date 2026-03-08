import type { StreamMap } from "@harmony/protocol";
import { createAuthApi, type AuthApi } from "./auth";
import { createRoomsApi, type RoomsApi } from "./rooms";
import { createSpacesApi, type SpacesApi } from "./spaces";
import { createSyncApi, type SyncApi } from "./sync";
import { WorkerConnection } from "./connection";

import Worker from "./worker?sharedworker";

export class Harmony {
  private connection: WorkerConnection;

  auth: AuthApi;
  rooms: RoomsApi;
  spaces: SpacesApi;
  sync: SyncApi;

  constructor() {
    const worker = new Worker({ name: "harmony-sync" });

    this.connection = new WorkerConnection(worker);
    this.auth = createAuthApi(this.connection);
    this.rooms = createRoomsApi(this.connection);
    this.spaces = createSpacesApi(this.connection);
    this.sync = createSyncApi(this.connection);
  }

  on<T extends keyof StreamMap>(
    type: T,
    listener: (message: StreamMap[T]) => void,
  ) {
    return this.connection.on(type, listener);
  }
}
