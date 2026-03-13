import { getSession, setSession } from "@/auth/session";
import { useLogin } from "@harmony/react";
import { TextField } from "@harmony/ui";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import * as v from "valibot";

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (getSession()) throw redirect({ to: "/" });
  },
});

const loginSchema = v.object({
  username: v.pipe(v.string(), v.minLength(1, "Username is required")),
  password: v.pipe(v.string(), v.minLength(1, "Password is required")),
});

function Login() {
  const login = useLogin();
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value: { username, password } }) => {
      const result = await login.submit({
        username,
        password,
      });

      if (result.status === "ok") {
        setSession(result.session);

        navigate({ to: "/" });
      }
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50-950 p-4">
      <div className="card preset-filled-surface-100-900 w-full max-w-sm space-y-6 p-8">
        <header className="text-center">
          <h1 className="h3">Harmony</h1>
          <p className="text-surface-500 text-sm">Sign in to continue</p>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
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

          {login.status === "error" && (
            <p className="text-error-500 text-sm">{login.error?.message}</p>
          )}

          <button
            className="btn preset-filled-primary-500 w-full"
            type="submit"
            disabled={login.status === "pending"}
          >
            {login.status === "pending" ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
