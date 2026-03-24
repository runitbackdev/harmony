import { getSession, joinSpace, useInvite, useRedeemInvite } from "@harmony/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/invite/$code")({
  component: InviteLanding,
});

function InviteLanding() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const session = getSession();

  const invite = useInvite(code);
  const redeem = useRedeemInvite();

  async function handleJoin() {
    if (!invite.data) return;

    const { spaceMxid } = await redeem.mutateAsync(code);
    await joinSpace(spaceMxid);
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

      {redeem.error && (
        <p className="text-error-500 text-sm">
          {redeem.error instanceof Error ? redeem.error.message : "Failed to join"}
        </p>
      )}

      {session ? (
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
