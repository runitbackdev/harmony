import { harmony, type AuthLoginResult } from "@harmony/core";
import type { Session } from "@harmony/protocol";
import { useCallback, useState } from "react";

export function useLogin() {
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );

  const submit = useCallback(
    async (request: { username: string; password: string }) => {
      setStatus("pending");
      setError(null);

      const result = await harmony.auth.login(request);

      if (result.status === "ok") {
        setStatus("idle");
      } else {
        setStatus("error");
        setError({ code: result.code, message: result.message });
      }

      return result;
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { submit, reset, error, status };
}

export function restoreSession(session: Session): Promise<AuthLoginResult> {
  return harmony.auth.restore(session);
}

export function useLogout() {
  return useCallback(async () => {
    return harmony.auth.logout();
  }, []);
}
