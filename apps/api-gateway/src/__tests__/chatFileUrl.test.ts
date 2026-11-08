process.env.AWS_REGION = process.env.AWS_REGION || "ap-south-1";
import { isChatFileUrl, S3_URL_PREFIX } from "../config/s3";

describe("isChatFileUrl", () => {
  it("accepts a chat upload", () => {
    expect(isChatFileUrl(`${S3_URL_PREFIX}chat/user/file_1.png`)).toBe(true);
  });

  it.each([
    ["a KYC document", `${S3_URL_PREFIX}employee_kyc/aadhar/user/a.png`],
    ["path traversal", `${S3_URL_PREFIX}chat/../employee_kyc/a.png`],
    ["encoded traversal", `${S3_URL_PREFIX}chat/%2e%2e/employee_kyc/a.png`],
    ["encoded prefix", `${S3_URL_PREFIX}%63hat/../employee_kyc/a.png`],
    ["another host", "https://evil.example/chat/a.png"],
    ["malformed encoding", `${S3_URL_PREFIX}chat/%E0%A4%A`],
    ["not a string", { $ne: "" }],
    ["empty", ""],
  ])("rejects %s", (_name, url) => {
    expect(isChatFileUrl(url)).toBe(false);
  });
});
