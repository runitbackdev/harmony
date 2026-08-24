import { homeserverOrigin } from "@harmony/react";
import { setMediaAuth, whenMediaReady } from "@harmony/core";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { restore } from "@/auth/api";
import { useAccountCommands } from "@/auth/commands";
import { warm } from "@/lifecycle/api";
import { sessionStore } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await sessionStore.get();
    if (!session) throw redirect({ to: "/login" });

    const result = await restore(session);

    if (!result.ok) {
      await sessionStore.clear();
      throw redirect({ to: "/login" });
    }

    setMediaAuth(result.value.accessToken, homeserverOrigin());

    // Wait out the SW claim under the boot spinner (concurrent with `warm`, so
    // it adds no latency on a soft load). The chat UI then mounts already
    // controlled, so plaintext media renders without a per-image spinner flash.
    const [warmed] = await Promise.all([warm(), whenMediaReady()]);
    if (!warmed.ok) throw new Error(warmed.error.message ?? warmed.error.code);
  },
  pendingComponent: () => (
    <div className="flex h-screen items-center justify-center bg-bg" role="status">
      <div className="flex flex-col items-center gap-4">
        <div className="size-12 animate-spin rounded-full border-4 border-line border-t-accent" />
        <p className="text-sub text-small">Loading Harmony...</p>
      </div>
    </div>
  ),
});

function RouteComponent() {
  useAccountCommands();
  return <Outlet />;
}
