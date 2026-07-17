import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/**/*.scss",
        "src/main.tsx",
        "src/core/workers/**", // web workers — not run under jsdom
        "src/core/wasm/**", // wasm bindings — not run under jsdom
      ],
    },
  },
  resolve: {
    alias: {
      "@web": path.resolve(__dirname, "src"),
    },
  },
});
