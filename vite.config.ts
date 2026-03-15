import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    plugins: ["react", "typescript"],
    jsPlugins: ["eslint-plugin-valtio", "@tanstack/eslint-plugin-router"],
    rules: {
      "valtio/state-snapshot-rule": "warn",
      "valtio/avoid-this-in-proxy": "error",
      "@tanstack/router/create-route-property-order": "warn",
    },
    ignorePatterns: ["dist", "node_modules", "crates"],
    settings: {
      typeAware: true,
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
