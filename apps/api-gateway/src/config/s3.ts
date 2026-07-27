import { S3Client } from "@aws-sdk/client-s3";

export const S3_BUCKET = "praesto";
export const S3_REGION = "ap-south-1";

export const s3Client = new S3Client({
  region: S3_REGION,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export const S3_URL_PREFIX = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/`;

export function s3FileUrl(key: string): string {
  return `${S3_URL_PREFIX}${key}`;
}
