import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  defaultPendingMs: 500,
  defaultPendingMinMs: 500,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
