#!/usr/bin/env node
// Quick script to upload the hero video to R2.
// Run with: railway run node scripts/upload-video.mjs

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { resolve } from "path";

const videoPath = resolve("deepsytevideo.mp4");
const buffer = readFileSync(videoPath);
console.log(`Read ${(buffer.length / 1024 / 1024).toFixed(1)} MB from ${videoPath}`);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const key = "assets/hero-video.mp4";

await r2.send(
  new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: "video/mp4",
    CacheControl: "public, max-age=31536000, immutable",
  })
);

const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
console.log(`✅ Uploaded to: ${publicUrl}`);
