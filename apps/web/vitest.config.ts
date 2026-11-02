import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { reactCompiler } from "./vite.config";
import path from "path";

export default defineConfig({
  // Same compiler as the app build, so tests run the code that ships.
  plugins: [react(), babel({ presets: [reactCompiler()] })],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
  resolve: {
    alias: {
      "@web": path.resolve(__dirname, "src/shared-core"),
      "@next": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom", "react-router-dom", "framer-motion"],
  },
});
