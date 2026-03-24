import camelcaseKeys from "camelcase-keys";
import snakecaseKeys from "snakecase-keys";
import { getSession } from "./session";

export type InviteLink = {
  code: string;
  spaceMxid: string;
  expiresAt: string | null;
  name: string;
  memberCount: number;
};

export type CreateInviteOptions = {
  code?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
};

export type RedeemResult = {
  spaceMxid: string;
};

export type InvitesApi = {
  resolve: (code: string) => Promise<InviteLink>;
  create: (spaceMxid: string, options?: CreateInviteOptions) => Promise<InviteLink>;
  redeem: (code: string) => Promise<RedeemResult>;
  revoke: (code: string) => Promise<void>;
};

export function createInvitesApi(): InvitesApi {
  async function request(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("Content-Type", "application/json");

    const response = await fetch(path, { ...init, headers });

    if (!response.ok) {
      throw new Error(`Herald API error: ${response.status}`);
    }

    if (response.status === 204) return null;

    return camelcaseKeys(await response.json(), { deep: true });
  }

  function json(body: Record<string, unknown>) {
    return JSON.stringify(snakecaseKeys(body, { deep: true }));
  }

  function authHeaders(): HeadersInit {
    const session = getSession();
    if (!session) throw new Error("Not authenticated");

    return { Authorization: `Bearer ${session.accessToken}` };
  }

  return {
    async resolve(code) {
      return request(`/api/invites/${encodeURIComponent(code)}`);
    },

    async create(spaceMxid, options = {}) {
      return request("/api/invites", {
        method: "POST",
        headers: authHeaders(),
        body: json({ invite: { spaceMxid, ...options } }),
      });
    },

    async redeem(code) {
      return request(`/api/invites/${encodeURIComponent(code)}/redemption`, {
        method: "POST",
        headers: authHeaders(),
      });
    },

    async revoke(code) {
      await request(`/api/invites/${encodeURIComponent(code)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },
  };
}
