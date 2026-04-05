#!/usr/bin/env node

// Post-build script to convert blocking CSS to preloaded CSS

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.join(__dirname, "../dist");
const indexPath = path.join(buildDir, "index.html");

// Read index.html
let html = fs.readFileSync(indexPath, "utf8");

// Find all CSS link tags — handles both CRA (href first) and Vite (rel first) attribute order
const cssLinkRegex =
  /<link\s+(?=[^>]*rel="stylesheet")[^>]*href="([^"]+\.css)"[^>]*\/?>/gi;
const cssFiles = [];
let match;

while ((match = cssLinkRegex.exec(html)) !== null) {
  cssFiles.push(match[1]);
}

if (cssFiles.length === 0) {
  process.exit(0);
}

// Remove original blocking CSS links
html = html.replace(cssLinkRegex, "");

// Create preload links with async loading trick
const preloadLinks = cssFiles
  .map(
    (href) =>
      `<link rel="preload" href="${href}" as="style" onload="this.onload=null;this.rel='stylesheet'">`,
  )
  .join("\n    ");

const noscriptLinks = cssFiles
  .map((href) => `<link rel="stylesheet" href="${href}">`)
  .join("\n      ");

const noscriptTag = `<noscript>\n      ${noscriptLinks}\n    </noscript>`;

// Insert preload links in the <head> section
const headCloseIndex = html.indexOf("</head>");
if (headCloseIndex === -1) {
  console.error("Could not find </head> tag in index.html");
  process.exit(1);
}

html =
  html.slice(0, headCloseIndex) +
  `    ${preloadLinks}\n` +
  `    ${noscriptTag}\n` +
  html.slice(headCloseIndex);

// Write back to index.html
fs.writeFileSync(indexPath, html, "utf8");
