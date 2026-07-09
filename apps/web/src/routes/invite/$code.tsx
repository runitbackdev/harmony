import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card } from "@runitback/react";
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
        <p className="text-sub text-small">This invite is no longer valid.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      {invite.isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading space preview">
          <div className="mx-auto h-6 w-32 animate-pulse rounded bg-soft" />
          <div className="mx-auto h-4 w-20 animate-pulse rounded bg-soft" />
        </div>
      ) : (
        <>
          <h2 className="text-subhead text-ink">{invite.data?.name}</h2>
          <p className="text-sub text-small">
            {invite.data?.memberCount} {invite.data?.memberCount === 1 ? "member" : "members"}
          </p>
        </>
      )}

      {redeem.error && <p className="text-danger text-small">{redeemErrorMessage(redeem.error)}</p>}

      {session.data ? (
        <Button
          className="w-full"
          onClick={() => void handleJoin()}
          disabled={redeem.isPending || !invite.data}
        >
          {redeem.isPending ? "Joining…" : "Join"}
        </Button>
      ) : (
        <Button
          className="w-full"
          onClick={() => void navigate({ to: "/login", search: { invite: code } })}
        >
          Sign in to join
        </Button>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-xs space-y-4 p-8 text-center">
        <h1 className="text-title">Harmony</h1>
        {children}
      </Card>
    </div>
  );
}
