import { clearSession, getSession, setSession } from "@/auth/session";
import {
  restoreSession,
  useLogout,
  useSync,
  useSyncStatus,
} from "@harmony/react";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";

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
  },
});

function RouteComponent() {
  useSync();
  const status = useSyncStatus();
  const logout = useLogout();

  return (
    <div className="flex flex-col gap-4">
      <div>Sync: {status ?? "idle"}</div>

      <nav className="flex gap-2">
        <Link to="/">Home</Link>
        <Link to="/settings">Settings</Link>
      </nav>

      <Outlet />

      <button
        type="button"
        onClick={async () => {
          await logout();
          await clearSession();

          window.location.href = "/login";
        }}
      >
        Logout
      </button>
    </div>
  );
}
