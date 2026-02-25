#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const publicDir = path.join(root, "public");
const imagesDir = path.join(publicDir, "images");
const ogDir = path.join(publicDir, "og");

const args = new Set(process.argv.slice(2));
const runAll = args.size === 0 || args.has("--all");

const TARGET_QUALITY = {
  jpg: 82,
  webp: 82,
  avif: 58,
  pngCompressionLevel: 9,
};

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function listFilesRecursive(dirPath) {
  if (!(await exists(dirPath))) return [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) return listFilesRecursive(fullPath);
      return [fullPath];
    })
  );

  return files.flat();
}

function isSourceRasterImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg" || ext === ".png";
}

function removeExt(filePath) {
  const ext = path.extname(filePath);
  return filePath.slice(0, -ext.length);
}

function normalizePathForCompare(filePath) {
  return path.resolve(filePath).toLowerCase();
}

function isSamePath(a, b) {
  return normalizePathForCompare(a) === normalizePathForCompare(b);
}

async function writeOutputImage(pipeline, sourcePath, outputPath) {
  if (!isSamePath(sourcePath, outputPath)) {
    await pipeline.toFile(outputPath);
    return;
  }

  const parsed = path.parse(outputPath);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempOutputPath = path.join(parsed.dir, `${parsed.name}.tmp-opt-${unique}${parsed.ext}`);

  await pipeline.toFile(tempOutputPath);
  await fs.unlink(outputPath).catch((error) => {
    if (error && error.code !== "ENOENT") throw error;
  });
  await fs.rename(tempOutputPath, outputPath);
}

async function convertImageVariants(sourcePath, outputBasePath) {
  const source = sharp(sourcePath, { failOn: "none" });

  await Promise.all([
    writeOutputImage(source.clone().webp({ quality: TARGET_QUALITY.webp }), sourcePath, `${outputBasePath}.webp`),
    writeOutputImage(source.clone().avif({ quality: TARGET_QUALITY.avif }), sourcePath, `${outputBasePath}.avif`),
  ]);

  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === ".png") {
    await writeOutputImage(
      source.clone().png({ compressionLevel: TARGET_QUALITY.pngCompressionLevel, adaptiveFiltering: true }),
      sourcePath,
      `${outputBasePath}.png`
    );
  } else {
    await writeOutputImage(
      source.clone().jpeg({ quality: TARGET_QUALITY.jpg, mozjpeg: true }),
      sourcePath,
      `${outputBasePath}.jpg`
    );
  }
}

async function optimizeGeneralImages() {
  const files = (await listFilesRecursive(imagesDir)).filter(isSourceRasterImage);

  for (const file of files) {
    if (file.endsWith(".webp") || file.endsWith(".avif")) continue;

    const base = removeExt(file);
    await convertImageVariants(file, base);
  }

  console.log(`[images] optimized ${files.length} source image(s).`);
}

async function resolveHeroSource() {
  const candidates = [
    path.join(imagesDir, "hero.jpg"),
    path.join(imagesDir, "hero.jpeg"),
    path.join(imagesDir, "hero.png"),
    path.join(imagesDir, "hero-2560w.jpg"),
    path.join(imagesDir, "hero-2560w.png"),
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  return null;
}

async function optimizeHeroImages() {
  await ensureDir(imagesDir);
  const source = await resolveHeroSource();
  if (!source) {
    console.log("[hero] skipped: no hero source found (hero.jpg|png or hero-2560w.jpg|png).");
    return;
  }

  const widths = [640, 1024, 1920, 2560];
  for (const width of widths) {
    const outBase = path.join(imagesDir, `hero-${width}w`);
    const pipeline = sharp(source, { failOn: "none" }).resize({ width, withoutEnlargement: true });

    await Promise.all([
      writeOutputImage(pipeline.clone().webp({ quality: TARGET_QUALITY.webp }), source, `${outBase}.webp`),
      writeOutputImage(pipeline.clone().avif({ quality: TARGET_QUALITY.avif }), source, `${outBase}.avif`),
      writeOutputImage(pipeline.clone().jpeg({ quality: TARGET_QUALITY.jpg, mozjpeg: true }), source, `${outBase}.jpg`),
    ]);
  }

  console.log("[hero] generated 640/1024/1920/2560 variants (avif/webp/jpg).");
}

async function optimizeTestimonials() {
  const testimonialDir = path.join(imagesDir, "testimonials");
  const files = (await listFilesRecursive(testimonialDir)).filter(isSourceRasterImage);

  for (const file of files) {
    const outBase = removeExt(file);
    await convertImageVariants(file, outBase);
  }

  console.log(`[testimonials] optimized ${files.length} source image(s).`);
}

async function optimizeOgImages() {
  await ensureDir(ogDir);
  const ogSources = (await listFilesRecursive(ogDir)).filter(isSourceRasterImage);

  if (ogSources.length === 0) {
    const fallback = path.join(publicDir, "ks.png");
    if (await exists(fallback)) {
      const outBase = path.join(ogDir, "family");
      const resized = sharp(fallback, { failOn: "none" }).resize({ width: 1200, height: 630, fit: "cover" });
      await Promise.all([
        writeOutputImage(resized.clone().webp({ quality: TARGET_QUALITY.webp }), fallback, `${outBase}.webp`),
        writeOutputImage(resized.clone().avif({ quality: TARGET_QUALITY.avif }), fallback, `${outBase}.avif`),
        writeOutputImage(resized.clone().png({ compressionLevel: TARGET_QUALITY.pngCompressionLevel }), fallback, `${outBase}.png`),
      ]);
      console.log("[og] generated fallback family OG image from public/ks.png.");
      return;
    }

    console.log("[og] skipped: no source images in /public/og and no /public/ks.png fallback.");
    return;
  }

  for (const source of ogSources) {
    const base = removeExt(source);
    const resized = sharp(source, { failOn: "none" }).resize({ width: 1200, height: 630, fit: "cover" });

    await Promise.all([
      writeOutputImage(resized.clone().webp({ quality: TARGET_QUALITY.webp }), source, `${base}.webp`),
      writeOutputImage(resized.clone().avif({ quality: TARGET_QUALITY.avif }), source, `${base}.avif`),
      writeOutputImage(resized.clone().png({ compressionLevel: TARGET_QUALITY.pngCompressionLevel }), source, `${base}.png`),
    ]);
  }

  console.log(`[og] optimized ${ogSources.length} source image(s) to 1200x630 webp/avif/png.`);
}

async function run() {
  if (runAll || args.has("--images")) await optimizeGeneralImages();
  if (runAll || args.has("--hero")) await optimizeHeroImages();
  if (runAll || args.has("--testimonials")) await optimizeTestimonials();
  if (runAll || args.has("--og")) await optimizeOgImages();
}

try {
  await run();
} catch (error) {
  console.error("Image optimization failed:", error);
  process.exitCode = 1;
}
