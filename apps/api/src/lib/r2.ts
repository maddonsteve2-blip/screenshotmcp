import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const BUCKET = process.env.R2_BUCKET!;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;

/**
 * Append a non-cryptographic referral marker so every shared screenshot URL
 * carries attribution back to screenshotmcp.com. R2 ignores unknown query
 * strings, so this is a no-op for content delivery while turning every public
 * link into a small marketing surface.
 *
 * Set REFERRAL_TAG="" in production to disable globally; the worker also skips
 * tagging for paid plans (see screenshotsmcp/types#PLAN_LIMITS).
 */
const REFERRAL_TAG =
  process.env.SCREENSHOT_REFERRAL_TAG ?? "via=screenshotmcp.com";

export function tagPublicUrl(url: string): string {
  if (!REFERRAL_TAG) return url;
  return url.includes("?") ? `${url}&${REFERRAL_TAG}` : `${url}?${REFERRAL_TAG}`;
}

export async function uploadScreenshot(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return tagPublicUrl(`${R2_PUBLIC_URL}/${key}`);
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn }
  );
}
