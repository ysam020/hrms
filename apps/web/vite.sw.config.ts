import { defineConfig } from "vite";
import path from "path";

// Builds Praesto Next's service worker (sw/sw.ts — app-shell precaching,
// offline navigation, Background Sync wake-up and Firebase background
// messages) as one self-contained script at dist/firebase-messaging-sw.js,
// the URL Classic's worker used, so it replaces that worker in place. It
// runs after the app build and must not clear dist; the precache manifest is
// injected afterwards by scripts/inject-sw-manifest.mjs.
export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    minify: true,
    lib: {
      entry: path.resolve(__dirname, "sw/sw.ts"),
      formats: ["iife"],
      name: "PraestoServiceWorker",
      fileName: () => "firebase-messaging-sw.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
