import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// Shared business modules (HTTP client, session providers, permissions,
// schemas, hooks) live in src/shared-core and are imported as "@web/…".
// They came from the former Classic app and keep its import paths.
const sharedCore = path.resolve(__dirname, "src/shared-core");
const certDir = path.resolve(__dirname, "../../packages/certificates");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.PRAESTO_API_PROXY || "https://localhost:9002";
  // Non-secret default lives here (the repo ignores .env.* files): a
  // same-origin API, proxied below, so the gateway's CORS list and the
  // host-only refresh cookie work unchanged.
  const apiString = env.VITE_API_STRING || "/api/v1";
  const hasCerts =
    fs.existsSync(path.join(certDir, "key.pem")) &&
    fs.existsSync(path.join(certDir, "cert.pem"));

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_API_STRING": JSON.stringify(apiString),
    },
    resolve: {
      alias: {
        "@web": sharedCore,
        "@next": path.resolve(__dirname, "src"),
        moment: "dayjs",
      },
      // One React, router and motion instance across the app and its deps.
      dedupe: [
        "react",
        "react-dom",
        "react-router",
        "react-router-dom",
        "framer-motion",
        "dayjs",
        "zod",
        "axios",
      ],
    },
    server: {
      port: 5174,
      strictPort: true,
      https: hasCerts
        ? {
            key: fs.readFileSync(path.join(certDir, "key.pem")),
            cert: fs.readFileSync(path.join(certDir, "cert.pem")),
          }
        : undefined,
      fs: { allow: [path.resolve(__dirname, "../..")] },
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true, secure: false },
        "/socket.io": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
    preview: { port: 5174 },
    build: {
      outDir: "dist",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes("/react-dom/") ||
              id.includes("/react-router") ||
              id.includes("/react/") ||
              id.includes("/scheduler/")
            )
              return "vendor-react";
            if (id.includes("framer-motion") || id.includes("motion-dom"))
              return "vendor-motion";
          },
        },
      },
    },
  };
});
