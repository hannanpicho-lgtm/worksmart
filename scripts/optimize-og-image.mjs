#!/usr/bin/env node
/**
 * Re-encode public/og-image.png with stronger PNG compression.
 * Overwrites only if output is smaller (same 1200×630 dimensions).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const target = resolve(process.cwd(), "public/og-image.png");
const before = readFileSync(target);

const { width, height } = await sharp(before).metadata();
let pipeline = sharp(before);
if (width !== 1200 || height !== 630) {
  pipeline = pipeline.resize(1200, 630, { fit: "cover", position: "centre" });
  console.log(
    `optimize-og-image: resizing ${width}×${height} → 1200×630 for OG spec.`,
  );
}

const buf = await pipeline
  .png({
    compressionLevel: 9,
    adaptiveFiltering: true,
    effort: 10,
  })
  .toBuffer();

const s1 = before.length;
const s2 = buf.length;
const resized = width !== 1200 || height !== 630;

if (!resized && s2 >= s1) {
  console.log(
    `optimize-og-image: no win (${s1} → ${s2} bytes); left file unchanged.`,
  );
  process.exit(0);
}

writeFileSync(target, buf);
const pct = s1 ? ((1 - s2 / s1) * 100).toFixed(1) : "0";
console.log(
  resized
    ? `optimize-og-image: wrote ${s2} bytes (was ${s1}; resized + compressed, ${pct}% vs original).`
    : `optimize-og-image: ${s1} → ${s2} bytes (${pct}% smaller)`,
);
