import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSession } from "@/auth/api";
import { HeraldApiError, useInvite, useRedeemInvite } from "@/invites/api";

function redeemErrorMessage(error: unknown): string {
  if (error instanceof HeraldApiError) {
    switch (error.status) {
      case 410:
        return "This invite has expired.";
      case 403:
        return "This invite has reached its max uses.";
      case 404:
        return "This invite is no longer valid.";
      case 502:
        return "Couldn't reach the homeserver. Try again.";
    }
  }
  return error instanceof Error ? error.message : "Failed to join.";
}

export const Route = createFileRoute("/invite/$code")({
  component: InviteLanding,
});

function InviteLanding() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const session = useSession();

  const invite = useInvite(code);
  const redeem = useRedeemInvite();

  async function handleJoin() {
    if (!invite.data) return;

    const { spaceMxid } = await redeem.mutateAsync(code);
    void navigate({ to: "/$spaceId", params: { spaceId: spaceMxid } });
  }

  if (invite.isError) {
    return (
      <Shell>
        <p className="text-surface-500 text-sm">This invite is no longer valid.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      {invite.isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading space preview">
          <div className="mx-auto h-6 w-32 animate-pulse rounded bg-surface-200-800" />
          <div className="mx-auto h-4 w-20 animate-pulse rounded bg-surface-200-800" />
        </div>
      ) : (
        <>
          <h2 className="h4 text-surface-950-50">{invite.data?.name}</h2>
          <p className="text-surface-500 text-sm">
            {invite.data?.memberCount} {invite.data?.memberCount === 1 ? "member" : "members"}
          </p>
        </>
      )}

      {redeem.error && <p className="text-error-500 text-sm">{redeemErrorMessage(redeem.error)}</p>}

      {session.data ? (
        <button
          className="btn preset-filled-primary-500 w-full"
          onClick={() => void handleJoin()}
          disabled={redeem.isPending || !invite.data}
        >
          {redeem.isPending ? "Joining…" : "Join"}
        </button>
      ) : (
        <button
          className="btn preset-filled-primary-500 w-full"
          onClick={() => void navigate({ to: "/login", search: { invite: code } })}
        >
          Sign in to join
        </button>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50-950 p-4">
      <div className="card preset-filled-surface-100-900 w-full max-w-xs space-y-4 p-8 text-center">
        <h1 className="h3">Harmony</h1>
        {children}
      </div>
    </div>
  );
}
