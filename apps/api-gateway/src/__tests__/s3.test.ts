import { s3FileUrl, S3_BUCKET, S3_REGION } from "../config/s3";

describe("s3FileUrl", () => {
  it("builds the public S3 URL for a given key", () => {
    expect(s3FileUrl("uploads/resume.pdf")).toBe(
      `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/uploads/resume.pdf`,
    );
  });
});
