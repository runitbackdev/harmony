import { spaces } from "./spaces";
import { startSync } from "./sync";

export async function initialize() {
  startSync();
  await spaces.start();
}
