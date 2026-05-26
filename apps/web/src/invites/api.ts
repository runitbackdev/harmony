import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionStore } from "@/lib/session";

export type InviteLink = {
  code: string;
  spaceMxid: string;
  creatorMxid: string;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  name?: string;
  memberCount?: number;
};

export type CreateInviteOptions = {
  code?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
};

export type RedeemResult = {
  spaceMxid: string;
};

export class HeraldApiError extends Error {
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? `Herald API error: ${status}`);
    this.name = "HeraldApiError";
    this.status = status;
  }
}

export function createInviteErrorMessage(error: unknown): string {
  if (error instanceof HeraldApiError) {
    if (error.status === 403) return "You don't have permission to invite in this space.";
    if (error.status === 502) return "Couldn't reach the homeserver. Try again.";
  }
  return "Failed to create invite link.";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new HeraldApiError(response.status);
  if (response.status === 204) return null as T;

  return (await response.json()) as T;
}

async function authHeaders(): Promise<HeadersInit> {
  const session = await sessionStore.get();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.accessToken}` };
}

export function resolveInvite(code: string): Promise<InviteLink> {
  return request(`/api/invites/${encodeURIComponent(code)}`);
}

export async function createInvite(
  spaceMxid: string,
  options: CreateInviteOptions = {},
): Promise<InviteLink> {
  return request("/api/invites", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ ...options, spaceMxid }),
  });
}

export async function redeemInvite(code: string): Promise<RedeemResult> {
  return request(`/api/invites/${encodeURIComponent(code)}/redemption`, {
    method: "POST",
    headers: await authHeaders(),
  });
}

export async function revokeInvite(code: string): Promise<void> {
  await request<null>(`/api/invites/${encodeURIComponent(code)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
}

export function useInvite(code: string) {
  return useQuery({
    queryKey: ["invite", code],
    queryFn: () => resolveInvite(code),
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ spaceMxid, options }: { spaceMxid: string; options?: CreateInviteOptions }) =>
      createInvite(spaceMxid, options),
    onSuccess: (invite) => {
      queryClient.setQueryData(["invite", invite.code], invite);
    },
  });
}

export function useRedeemInvite() {
  return useMutation({
    mutationFn: (code: string) => redeemInvite(code),
  });
}

export function useRevokeInvite() {
  return useMutation({
    mutationFn: (code: string) => revokeInvite(code),
  });
}
