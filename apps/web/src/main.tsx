import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { Profiler, Stats } from "@harmony/profiler";

import MatrixWorker from "./workers/matrix.shared-worker.ts?sharedworker";

const worker = new MatrixWorker();

worker.port.onmessage = (event) => {
  console.log(event.data);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Profiler>
      <App />
    </Profiler>
    <Stats />
  </StrictMode>,
);
