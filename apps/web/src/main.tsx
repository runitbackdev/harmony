import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { Profiler, Stats } from "@harmony/profiler";

import init, { hello_world } from "@harmony/wasm";

await init();
hello_world();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Profiler>
      <App />
    </Profiler>
    <Stats />
  </StrictMode>,
);
