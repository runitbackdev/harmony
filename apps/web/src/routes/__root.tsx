import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Omnibar } from "@/omnibar/omnibar";
import { useThemeCommands } from "@/themes/commands";

function Layout() {
  useThemeCommands();
  return (
    <>
      <Outlet />
      <Omnibar />
    </>
  );
}

export const Route = createRootRoute({
  component: Layout,
});
