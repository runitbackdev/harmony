import { harmony, type CreateInviteOptions } from "@harmony/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useInvite(code: string) {
  return useQuery({
    queryKey: ["invite", code],
    queryFn: () => harmony.invites.resolve(code),
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ spaceMxid, options }: { spaceMxid: string; options?: CreateInviteOptions }) =>
      harmony.invites.create(spaceMxid, options),
    onSuccess: (invite) => {
      queryClient.setQueryData(["invite", invite.code], invite);
    },
  });
}

export function useRedeemInvite() {
  return useMutation({
    mutationFn: (code: string) => harmony.invites.redeem(code),
  });
}

export function useRevokeInvite() {
  return useMutation({
    mutationFn: (code: string) => harmony.invites.revoke(code),
  });
}
