import { createAuthApi, type AuthApi } from "./auth";
import { WorkerConnection, type StreamListener } from "./connection";

import Worker from "./worker?sharedworker";

export class Harmony {
  private connection: WorkerConnection;

  auth: AuthApi;

  constructor() {
    const worker = new Worker();

    this.connection = new WorkerConnection(worker);
    this.auth = createAuthApi(this.connection);
  }

  on(listener: StreamListener) {
    this.connection.on(listener);
  }
}
