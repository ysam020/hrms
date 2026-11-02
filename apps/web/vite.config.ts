import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import fs from "fs";
import { createRequire } from "module";
import path from "path";

// Shared business modules (HTTP client, session providers, permissions,
// schemas, hooks) live in src/shared-core and are imported as "@web/…".
// They came from the former Classic app and keep its import paths.
const sharedCore = path.resolve(__dirname, "src/shared-core");
const certDir = path.resolve(__dirname, "../../packages/certificates");

// react-router-dom 6.30.3 pins @remix-run/router 1.23.2, but the workspace's
// security override lifts react-router to 6.30.4, which brings 1.23.3. Left
// alone the bundle carries both, and createBrowserRouter runs on the older
// one. Point every import at react-router's copy: one router, the patched one.
const requireFrom = (file: string) => createRequire(file).resolve;
const remixRouter = path.dirname(
  requireFrom(
    requireFrom(
      requireFrom(path.join(__dirname, "package.json"))(
        "react-router-dom/package.json",
      ),
    )("react-router/package.json"),
  )("@remix-run/router/package.json"),
);

// React Compiler memoizes components and hooks at build time. A component it
// can't prove safe is left as written (it never fails the build); the
// react-hooks lint rules report why. The landing page is left out: it's
// prerendered, animates outside React, and every visitor downloads it first,
// so compiling it only adds bytes.
export function reactCompiler() {
  const preset = reactCompilerPreset();
  preset.rolldown.filter = {
    ...preset.rolldown.filter,
    id: { exclude: [/\/src\/features\/landing\//] },
  };
  return preset;
}

export default defineConfig(({ mode, isSsrBuild }) => {
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
    plugins: [react(), babel({ presets: [reactCompiler()] })],
    define: {
      "import.meta.env.VITE_API_STRING": JSON.stringify(apiString),
    },
    resolve: {
      alias: {
        "@web": sharedCore,
        "@next": path.resolve(__dirname, "src"),
        moment: "dayjs",
        "@remix-run/router": remixRouter,
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
    // `vite build --ssr src/prerender/entry.tsx` renders the public pages
    // at build time (scripts/prerender.mjs); the client build's manifest
    // tells that script which CSS and chunks each page needs.
    build: isSsrBuild
      ? { outDir: "dist-prerender", emptyOutDir: true, copyPublicDir: false }
      : {
          outDir: "dist",
          manifest: true,
          rolldownOptions: {
            output: {
              // Long-lived vendor chunks, matched by exact package so that
              // e.g. @floating-ui/react-dom (react-joyride's, lazy) stays out.
              // A group also takes its modules' dependencies, so React gets
              // the higher priority: otherwise framer-motion's group claims
              // it and vendor-react ends up importing vendor-motion.
              codeSplitting: {
                groups: [
                  {
                    name: "vendor-react",
                    test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router)[\\/]/,
                    priority: 20,
                  },
                  {
                    name: "vendor-motion",
                    test: /[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/,
                    priority: 10,
                  },
                  // Face matching only (loaded on demand); named so the
                  // service worker can leave it out of the precache.
                  {
                    name: "vendor-faceapi",
                    test: /[\\/]node_modules[\\/](face-api\.js|@tensorflow[\\/]tfjs-core)[\\/]/,
                    priority: 10,
                  },
                ],
              },
            },
          },
        },
  };
});
