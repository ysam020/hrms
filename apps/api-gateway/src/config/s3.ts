import { S3Client } from "@aws-sdk/client-s3";

// Bucket and region come from configuration (S3_BUCKET / S3_REGION), so a
// staging deployment can never write into the production bucket. The
// historical production bucket is used ONLY when DEPLOY_ENV=production and
// S3_BUCKET is unset (backwards compatible for the existing production
// secret). Any other environment without S3_BUCKET gets a deliberately
// non-existent bucket name, so uploads fail closed instead of landing in
// production.
const PRODUCTION_DEFAULT_BUCKET = "praesto-189923011190";
export const S3_BUCKET =
  process.env.S3_BUCKET ||
  (process.env.DEPLOY_ENV === "production"
    ? PRODUCTION_DEFAULT_BUCKET
    : "s3-bucket-not-configured");
export const S3_REGION = process.env.S3_REGION || "ap-south-1";

export const s3Client = new S3Client({
  region: S3_REGION,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export const S3_URL_PREFIX = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/`;

export function s3FileUrl(key: string): string {
  return `${S3_URL_PREFIX}${key}`;
}
