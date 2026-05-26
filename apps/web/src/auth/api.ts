import { command, rpc } from "@harmony/core";
import type { LoginRequest, RestoreRequest } from "@harmony/core";
import { useQuery } from "@tanstack/react-query";
import { sessionStore } from "@/lib/session";

export const login = (input: LoginRequest) => rpc("auth.login", input);
export const restore = (input: RestoreRequest) => rpc("auth.restore", input);
export const logout = () => command("auth.logout", undefined);

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => sessionStore.get(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
