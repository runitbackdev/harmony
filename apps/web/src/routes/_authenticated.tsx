import { clearSession, getSession, setSession } from "@/auth/session";
import { initialize, restoreSession } from "@harmony/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = getSession();
    if (!session) throw redirect({ to: "/login" });

    const result = await restoreSession(session);

    if (result.status === "error") {
      void clearSession();
      throw redirect({ to: "/login" });
    }

    setSession(result.session);
    await initialize();
  },
  pendingComponent: () => (
    <div className="flex h-screen items-center justify-center bg-surface-50-950" role="status">
      <div className="flex flex-col items-center gap-4">
        <div className="size-12 animate-spin rounded-full border-4 border-surface-300-700 border-t-primary-500" />
        <p className="text-surface-500 text-sm">Loading Harmony...</p>
      </div>
    </div>
  ),
});

function RouteComponent() {
  return <Outlet />;
}
