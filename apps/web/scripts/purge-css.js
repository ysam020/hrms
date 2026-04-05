#!/usr/bin/env node

/**
 * PurgeCSS Script
 * Removes unused CSS from production builds
 * Run after build: node scripts/purge-css.js
 */

import { PurgeCSS } from "purgecss";
import fs from "fs";
import path from "path";
import { globSync } from "glob";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.join(__dirname, "../dist");
const cssDir = path.join(buildDir, "assets");

async function purgeCSSFiles() {
  try {
    console.log("Starting CSS purge process...");

    // Find all CSS files
    const cssFiles = globSync(`${cssDir}/*.css`, {
      ignore: [`${cssDir}/*.map`],
    });

    if (cssFiles.length === 0) {
      console.log("No CSS files found to purge");
      return;
    }

    console.log(`Found ${cssFiles.length} CSS file(s) to process`);

    // Find all HTML and JS files for content analysis
    const contentFiles = [
      ...globSync(`${buildDir}/**/*.html`),
      ...globSync(`${buildDir}/assets/**/*.js`, {
        ignore: [`${buildDir}/assets/**/*.map`],
      }),
    ];

    console.log(`Analyzing ${contentFiles.length} content files`);

    let totalSaved = 0;

    for (const cssFile of cssFiles) {
      const originalSize = fs.statSync(cssFile).size;
      const cssContent = fs.readFileSync(cssFile, "utf8");

      // Run PurgeCSS with corrected configuration
      const purgeCSSResults = await new PurgeCSS().purge({
        content: contentFiles,
        css: [{ raw: cssContent }],
        safelist: {
          // Preserve critical classes (standard patterns)
          standard: [
            /^MuiPaper/,
            /^MuiButton/,
            /^MuiTextField/,
            /^MuiIconButton/,
            /^MuiTypography/,
            /^MuiBox/,
            /^MuiGrid/,
            /^MuiCard/,
            /^MuiChip/,
            /^MuiAvatar/,
            /^MuiTable/,
            /^MuiTab/,
            /^Mui-/,
            /^css-/,
            /^loading/,
            /^error/,
            /^offline/,
            /^performance/,
            /^dashboard/,
            /^sidebar/,
            /^login/,
            /^dark/,
            /^light/,
            /active$/,
            /hover$/,
            /focus$/,
            /disabled$/,
            /selected$/,
            /checked$/,
          ],

          // Preserve dynamic classes (deep patterns)
          deep: [
            /MuiModal/,
            /MuiDialog/,
            /MuiPopover/,
            /MuiMenu/,
            /MuiTooltip/,
            /MuiSnackbar/,
            /MuiBackdrop/,
            /MuiDrawer/,
            /MuiAppBar/,
            /rbc-/,
            /fc-/,
            /apexcharts/,
            /apex-/,
          ],

          // Preserve all keyframe animations (array of patterns)
          keyframes: [/.*/],

          // Preserve all font-face rules (array of patterns)
          fontFace: [/.*/],

          // Preserve CSS variables (array of patterns)
          variables: [/.*/],
        },
      });

      if (purgeCSSResults && purgeCSSResults.length > 0) {
        const purgedContent = purgeCSSResults[0].css;

        // Write purged CSS back to file
        fs.writeFileSync(cssFile, purgedContent, "utf8");

        const newSize = fs.statSync(cssFile).size;
        const saved = originalSize - newSize;
        totalSaved += saved;

        const savedKB = (saved / 1024).toFixed(2);
        const percentSaved = ((saved / originalSize) * 100).toFixed(2);

        console.log(
          `${path.basename(cssFile)}: ${savedKB} KB saved (${percentSaved}%)`,
        );
      }
    }

    const totalSavedKB = (totalSaved / 1024).toFixed(2);
    console.log(`\nTotal CSS reduced by ${totalSavedKB} KB`);
    console.log("CSS purge complete!\n");
  } catch (error) {
    console.error("Error during CSS purge:", error);
    process.exit(1);
  }
}

purgeCSSFiles();
