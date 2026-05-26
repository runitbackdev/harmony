import { useNavigate } from "@tanstack/react-router";
import { LogOut, Shield, Smartphone } from "lucide-react";
import { logout } from "@/auth/api";
import { notImplemented } from "@/lib/toast";
import { sessionStore } from "@/lib/session";
import { useOmnibarCommands, type Command } from "@/omnibar";

function buildAccountCommands(handleSignout: () => void): Command[] {
  return [
    {
      id: "account.security",
      label: "Open security settings",
      icon: Shield,
      perform: notImplemented,
    },
    {
      id: "account.devices",
      label: "Manage devices and sessions",
      icon: Smartphone,
      perform: notImplemented,
    },
    {
      id: "account.signout",
      label: "Sign out",
      icon: LogOut,
      keywords: ["log out", "logout"],
      perform: handleSignout,
    },
    {
      id: "account.signout-others",
      label: "Sign out all other sessions",
      icon: LogOut,
      perform: notImplemented,
    },
    {
      id: "account.signout-everywhere",
      label: "Sign out everywhere",
      icon: LogOut,
      perform: notImplemented,
    },
  ];
}

/** Registers omnibar commands for the signed-in user.
 *  Mount once from a layout that only renders for authenticated users. */
export function useAccountCommands(): void {
  const navigate = useNavigate();

  const handleSignout = () => {
    void (async () => {
      logout();
      await sessionStore.clear();
      void navigate({ to: "/login" });
    })();
  };

  useOmnibarCommands(buildAccountCommands(handleSignout), [navigate]);
}
