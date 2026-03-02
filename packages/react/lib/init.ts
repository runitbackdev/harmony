import { spaces } from "./spaces";
import { startSync } from "./sync";

export function initialize() {
  startSync();
  spaces.start();
}
