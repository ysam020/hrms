import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [react()],
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
    https: {
      key: fs.readFileSync("../../packages/certificates/key.pem"),
      cert: fs.readFileSync("../../packages/certificates/cert.pem"),
    },
    port: 5173,
    headers: {
      "Document-Policy": "js-profiling",
      "Access-Control-Allow-Origin": "*",
    },
    proxy: {
      "/api": {
        target: "https://localhost:9002",
        changeOrigin: true,
        secure: false, // accept self-signed cert on the gateway
      },
    },
  },
});
