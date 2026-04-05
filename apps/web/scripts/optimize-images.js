#!/usr/bin/env node
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_DIR = path.join(__dirname, "../dist");
const PUBLIC_DIR = path.join(__dirname, "../public");

// Image optimization configurations
const IMAGE_CONFIGS = {
  logo: {
    source: "logo_dark.webp",
    sizes: [
      { width: 320, suffix: "-small" },
      { width: 500, suffix: "" },
    ],
    formats: ["webp", "png"],
  },
  employee_photos: {
    pattern: /employee_photo\.(jpeg|jpg|png)$/,
    sizes: [
      { width: 80, suffix: "-thumb" },
      { width: 160, suffix: "-thumb@2x" },
      { width: 240, suffix: "-medium" },
    ],
    formats: ["webp", "jpg"],
  },
};

async function optimizeImage(
  inputPath,
  outputPath,
  width,
  format,
  quality = 80,
) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Only resize if image is larger than target
    if (metadata.width > width) {
      image.resize(width, null, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Apply format-specific optimizations
    if (format === "webp") {
      await image.webp({ quality, effort: 6 }).toFile(outputPath);
    } else if (format === "jpg" || format === "jpeg") {
      await image
        .jpeg({ quality, progressive: true, mozjpeg: true })
        .toFile(outputPath);
    } else if (format === "png") {
      await image
        .png({ quality, compressionLevel: 9, adaptiveFiltering: true })
        .toFile(outputPath);
    }
  } catch (error) {
    console.error(`Error optimizing ${inputPath}:`, error.message);
  }
}

async function optimizeLogo() {
  const logoConfig = IMAGE_CONFIGS.logo;
  const sourcePath = path.join(PUBLIC_DIR, logoConfig.source);

  if (!fs.existsSync(sourcePath)) {
    return;
  }

  for (const size of logoConfig.sizes) {
    for (const format of logoConfig.formats) {
      const outputName = `logo_dark${size.suffix}.${format}`;
      const outputPath = path.join(BUILD_DIR, outputName);

      await optimizeImage(sourcePath, outputPath, size.width, format);
    }
  }
}

async function optimizeEmployeePhotos() {
  const uploadsDir = path.join(
    __dirname,
    "../../server/uploads/employee_kyc/employee_photo",
  );

  if (!fs.existsSync(uploadsDir)) {
    return;
  }

  const processDirectory = async (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await processDirectory(fullPath);
      } else if (
        entry.isFile() &&
        IMAGE_CONFIGS.employee_photos.pattern.test(entry.name)
      ) {
        const baseName = path.parse(entry.name).name;
        const outputDir = path.dirname(fullPath);

        for (const size of IMAGE_CONFIGS.employee_photos.sizes) {
          for (const format of ["webp", "jpg"]) {
            const outputName = `${baseName}${size.suffix}.${format}`;
            const outputPath = path.join(outputDir, outputName);

            await optimizeImage(fullPath, outputPath, size.width, format, 85);
          }
        }
      }
    }
  };

  await processDirectory(uploadsDir);
}

async function main() {
  try {
    await optimizeLogo();
    await optimizeEmployeePhotos();
  } catch (error) {
    console.error("\nOptimization failed:", error);
    process.exit(1);
  }
}

main();
