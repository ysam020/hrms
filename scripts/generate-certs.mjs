import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const certsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/certificates"
);

mkdirSync(certsDir, { recursive: true });

const certFile = join(certsDir, "cert.pem");
const keyFile = join(certsDir, "key.pem");
const caFile = join(certsDir, "rootCA.pem");

if (existsSync(certFile) && existsSync(keyFile) && existsSync(caFile)) {
  console.log("Certificates already exist, skipping generation.");
  process.exit(0);
}

// Use mkcert if available — produces certs trusted by all browsers automatically.
// Install with: brew install mkcert && mkcert -install
let usedMkcert = false;
try {
  execSync("which mkcert", { stdio: "ignore" });

  // Install the mkcert CA into all browser trust stores (idempotent)
  execSync("mkcert -install", { stdio: "inherit" });

  // Generate cert for localhost and 127.0.0.1 directly into certsDir
  execSync(`mkcert -key-file "${keyFile}" -cert-file "${certFile}" localhost 127.0.0.1`, {
    stdio: "inherit",
  });

  // Copy the mkcert root CA so nginx can reference it
  const caRoot = execSync("mkcert -CAROOT", { encoding: "utf8" }).trim();
  const mkcertCA = join(caRoot, "rootCA.pem");
  writeFileSync(caFile, readFileSync(mkcertCA));

  usedMkcert = true;
} catch {
  // mkcert not installed — fall back to selfsigned
}

if (!usedMkcert) {
  console.warn("mkcert not found — falling back to self-signed certificate.");
  console.warn("Browsers will show a security warning. Install mkcert to avoid this:");
  console.warn("  brew install mkcert && mkcert -install");
  console.warn("");

  const { default: selfsigned } = await import("selfsigned");

  const pems = await selfsigned.generate([{ name: "commonName", value: "localhost" }], {
    days: 365,
    algorithm: "sha256",
    keySize: 2048,
    extensions: [
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
        ],
      },
    ],
  });

  writeFileSync(keyFile, pems.private);
  writeFileSync(certFile, pems.cert);
  writeFileSync(caFile, pems.cert);
}

console.log("Generated certificates in packages/certificates/:");
console.log("  key.pem     — private key");
console.log("  cert.pem    — server certificate");
console.log("  rootCA.pem  — CA root certificate");
