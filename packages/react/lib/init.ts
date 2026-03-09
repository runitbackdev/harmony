import { spaces } from "./spaces";
import { startSync } from "./sync";

export async function initialize() {
  await startSync();
  await spaces.start();
}
