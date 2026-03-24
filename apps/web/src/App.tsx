import { Profiler, Stats } from "@harmony/profiler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

const queryClient = new QueryClient();

function App() {
  return (
    <>
      <QueryClientProvider client={queryClient}>
        <Profiler>
          <RouterProvider router={router} />
        </Profiler>
      </QueryClientProvider>
      <Stats />
    </>
  );
}

export default App;
