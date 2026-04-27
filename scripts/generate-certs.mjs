import selfsigned from "selfsigned";
import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const certsDir = join(dirname(fileURLToPath(import.meta.url)), "../packages/certificates");

const certFile = join(certsDir, "cert.pem");
const keyFile = join(certsDir, "key.pem");
const caFile = join(certsDir, "rootCA.pem");

if (existsSync(certFile) && existsSync(keyFile) && existsSync(caFile)) {
  console.log("Certificates already exist, skipping generation.");
  process.exit(0);
}

const attrs = [{ name: "commonName", value: "localhost" }];
const pems = await selfsigned.generate(attrs, {
  days: 365,
  algorithm: "sha256",
  keySize: 2048,
  extensions: [
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        { type: 2, value: "praesto.cloud" },
      ],
    },
  ],
});

writeFileSync(keyFile, pems.private);
writeFileSync(certFile, pems.cert);
writeFileSync(caFile, pems.cert);

console.log("Generated certificates in packages/certificates/:");
console.log("  key.pem     — private key");
console.log("  cert.pem    — server certificate");
console.log("  rootCA.pem  — CA certificate (same as cert for self-signed)");
