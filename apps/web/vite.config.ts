import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "firebase-messaging-sw.ts",
      // We handle SW registration ourselves in firebase.tsx / index.html
      injectRegister: false,
      // We have our own manifest.json in public/
      manifest: false,
      injectManifest: {
        // Only precache assets that are part of the build output
        globPatterns: ["**/*.{js,css,html,ico,png,webp,svg,woff2}"],
        // Exclude large/dynamic files from precaching
        globIgnores: ["**/node_modules/**", "offline.html"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB
      },
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
      },
    }),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react-error-boundary",
      "react-router-dom",
      "react-big-calendar",
      "dayjs",
      "@mui/material",
      "@mui/icons-material",
      "@emotion/react",
      "@emotion/styled",
      "primereact",
      "primeicons",
    ],
    alias: {
      "@web": path.resolve(__dirname, "src"),
      moment: "dayjs",
    },
  },
  server: {
    https:
      fs.existsSync("../../packages/certificates/key.pem") &&
      fs.existsSync("../../packages/certificates/cert.pem")
        ? {
            key: fs.readFileSync("../../packages/certificates/key.pem"),
            cert: fs.readFileSync("../../packages/certificates/cert.pem"),
          }
        : undefined,
    port: 5173,
    headers: {
      "Document-Policy": "js-profiling",
      "Access-Control-Allow-Origin": "*",
    },
    proxy: {
      "/api": {
        target: "https://localhost:9002",
        changeOrigin: true,
        secure: false,
      },
      "/prometheus": {
        target: "http://localhost:9090",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/prometheus/, ""),
      },
      "/loki": {
        target: "http://localhost:3100",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/loki/, ""),
      },
    },
  },
});
