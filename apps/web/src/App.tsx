import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { queryClient } from "./lib/query-client";
import { Toaster } from "./lib/toaster";
import { OmnibarProvider } from "./omnibar";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <OmnibarProvider>
        <RouterProvider router={router} />
      </OmnibarProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
