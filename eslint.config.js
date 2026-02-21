import js from "@eslint/js";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import pluginRouter from "@tanstack/eslint-plugin-router";
import valtio from "eslint-plugin-valtio";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["**/dist", "**/node_modules", "crates/**"]),

  // Base TS config for all packages
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },

  // React hooks — only for React-containing packages
  {
    files: [
      "apps/web/**/*.{ts,tsx}",
      "packages/react/**/*.{ts,tsx}",
      "packages/ui/**/*.{ts,tsx}",
      "packages/profiler/**/*.{ts,tsx}",
      "packages/composer/**/*.{ts,tsx}",
    ],
    extends: [reactHooks.configs.flat.recommended],
  },

  // Valtio — same scope as React hooks
  {
    files: [
      "apps/web/**/*.{ts,tsx}",
      "packages/react/**/*.{ts,tsx}",
      "packages/ui/**/*.{ts,tsx}",
      "packages/profiler/**/*.{ts,tsx}",
      "packages/composer/**/*.{ts,tsx}",
    ],
    extends: [valtio.configs["flat/recommended"]],
  },

  // React Refresh — only for Vite apps
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactRefresh.configs.vite],
  },

  // TanStack Router — only for apps using the router
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [...pluginRouter.configs["flat/recommended"]],
  },

  // Prettier — must be last to disable conflicting rules
  eslintConfigPrettier,
]);
