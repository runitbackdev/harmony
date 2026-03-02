import { clearSession, getSession, setSession } from "@/auth/session";
import { initialize, restoreSession } from "@harmony/react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Suspense } from "react";

export const Route = createFileRoute("/_authenticated")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = getSession();
    if (!session) throw redirect({ to: "/login" });

    const result = await restoreSession(session);

    if (result.status === "error") {
      clearSession();
      throw redirect({ to: "/login" });
    }

    setSession(result.session);
    initialize();
  },
});

function RouteComponent() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Outlet />
    </Suspense>
  );
}
