import { Profiler, Stats } from "@harmony/profiler";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

function App() {
  return (
    <>
      <Profiler>
        <RouterProvider router={router} />
      </Profiler>
      <Stats />
    </>
  );
}

export default App;
