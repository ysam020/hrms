import https from "https";
import express from "express";
import path from "path";
import fs from "fs";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 9000;

// Rate limiter: 100 requests per 60 seconds per IP
const limiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Enable gzip compression
app.use(compression({ level: 9 }));

// Apply rate limiting to all requests (including static files)
app.use(limiter);

// Serve static files with intelligent cache headers
app.use(
  express.static(path.join(__dirname, "dist"), {
    setHeaders: (res, filePath) => {
      // Vite names hashed assets as: name-XXXXXXXX.js / name-XXXXXXXX.css
      const hasContentHash = /\-[a-zA-Z0-9]{8,}\.(js|css)$/.test(filePath);
      const isImage = /\.(png|jpg|jpeg|gif|svg|webp|ico)$/.test(filePath);
      const isFont = /\.(woff|woff2|ttf|eot)$/.test(filePath);
      const isMedia = /\.(mp4|webm|ogg|mp3|wav)$/.test(filePath);

      if (hasContentHash) {
        // Immutable files with content hash - cache for 1 year
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (isImage || isFont || isMedia) {
        // Images, fonts, media - cache for 1 year
        res.setHeader("Cache-Control", "public, max-age=31536000");
      } else if (filePath.endsWith("index.html")) {
        res.setHeader(
          "Cache-Control",
          "private, no-cache, max-age=0, must-revalidate",
        );
      } else {
        // Other static files - cache for 30 days
        res.setHeader("Cache-Control", "public, max-age=2592000");
      }
    },
  }),
);

// SPA fallback - serve index.html for all routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// HTTPS configuration
const httpsOptions = {
  key: fs.readFileSync(
    path.join(__dirname, "../../packages/certificates/key.pem"),
  ),
  cert: fs.readFileSync(
    path.join(__dirname, "../../packages/certificates/cert.pem"),
  ),
};

// Start HTTPS server
https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`URL: https://localhost:${PORT}`);
  console.log("");
  console.log("Cache Strategy:");
  console.log("  Hashed JS/CSS:   1 year (immutable)");
  console.log("  Images/Fonts:    1 year");
  console.log("  HTML files:      No cache");
  console.log("  Other files:     30 days");
});
