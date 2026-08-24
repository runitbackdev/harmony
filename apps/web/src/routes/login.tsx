import { useRpc } from "@harmony/react";
import { Button, Card } from "@runitbk/react";
import { TextField } from "@/ui";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import * as v from "valibot";
import { setMediaAuth } from "@harmony/core";
import { homeserverOrigin } from "@harmony/react";
import { sessionStore } from "@/lib/session";

const searchSchema = v.object({
  invite: v.optional(v.string()),
});

export const Route = createFileRoute("/login")({
  component: Login,
  validateSearch: searchSchema,
  beforeLoad: async () => {
    if (await sessionStore.get()) throw redirect({ to: "/" });
  },
});

const loginSchema = v.object({
  username: v.pipe(v.string(), v.minLength(1, "Username is required")),
  password: v.pipe(v.string(), v.minLength(1, "Password is required")),
});

function Login() {
  const login = useRpc("auth.login");
  const navigate = useNavigate();
  const { invite } = Route.useSearch();

  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value: { username, password } }) => {
      const result = await login.mutateAsync({
        homeserver: homeserverOrigin(),
        username,
        password,
      });

      if (result.ok) {
        await sessionStore.set(result.value);
        setMediaAuth(result.value.accessToken, homeserverOrigin());
        void navigate(invite ? { to: "/invite/$code", params: { code: invite } } : { to: "/" });
      }
    },
  });

  const failure = login.data && !login.data.ok ? login.data.error : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <Card className="w-full max-w-sm space-y-6 p-8">
        <header className="text-center">
          <h1 className="text-title">Harmony</h1>
          <p className="text-sub text-small">Sign in to continue</p>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field name="username">
            {(field) => (
              <TextField
                label="Username"
                type="text"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0]?.message}
                autoFocus
              />
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <TextField
                label="Password"
                type="password"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0]?.message}
              />
            )}
          </form.Field>

          {failure && <p className="text-danger text-small">{failure.message ?? failure.code}</p>}

          <Button type="submit" disabled={login.isPending} className="w-full">
            {login.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
