import { clearSession, getSession, setSession } from "@/auth/session";
import { restoreSession, useLogout } from "@harmony/react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

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
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div>
      Hello "/_authenticated"!
      <button
        type="button"
        onClick={() => {
          logout()
            .then(clearSession)
            .finally(() => navigate({ to: "/login" }));
        }}
      >
        Logout
      </button>
    </div>
  );
}
