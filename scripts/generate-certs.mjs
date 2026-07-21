import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { networkInterfaces } from "os";

const certsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/certificates"
);

// Physical phones (Expo Go, dev builds) hit the gateway over the LAN, not
// localhost — the dev cert needs the machine's LAN IP(s) in its SAN list or
// TLS hostname verification fails ("This Connection Is Not Private") even
// once the phone trusts the root CA. Re-run this script (after deleting the
// existing cert.pem/key.pem/rootCA.pem) whenever your LAN IP changes.
const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
  .map((iface) => iface.address);

mkdirSync(certsDir, { recursive: true });

const certFile = join(certsDir, "cert.pem");
const keyFile = join(certsDir, "key.pem");
const caFile = join(certsDir, "rootCA.pem");
// Separate identity for gRPC clients (api-gateway) — mTLS requires the
// client to present its own cert distinct from the servers' cert.pem, since
// grpc-js's TLS handshake resets the connection when the peer presents a
// certificate identical to the verifier's own (confirmed by direct testing:
// swapping in a distinct client identity, same CA, fixed it).
const clientCertFile = join(certsDir, "client-cert.pem");
const clientKeyFile = join(certsDir, "client-key.pem");

if (
  existsSync(certFile) &&
  existsSync(keyFile) &&
  existsSync(caFile) &&
  existsSync(clientCertFile) &&
  existsSync(clientKeyFile)
) {
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

  // Generate cert for localhost, 127.0.0.1, and any LAN IPs (for phones on
  // the same network) directly into certsDir
  const mkcertHosts = ["localhost", "127.0.0.1", ...lanIps].join(" ");
  execSync(`mkcert -key-file "${keyFile}" -cert-file "${certFile}" ${mkcertHosts}`, {
    stdio: "inherit",
  });

  // Separate client identity, signed by the same CA, for gRPC mTLS callers.
  execSync(
    `mkcert -client -key-file "${clientKeyFile}" -cert-file "${clientCertFile}" grpc-internal-client`,
    { stdio: "inherit" },
  );

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
          ...lanIps.map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
  });

  // Separate self-signed identity for gRPC clients (see note above on why
  // client and server can't share one cert). Neither is a real CA, so both
  // leaf certs are bundled into rootCA.pem as mutually-trusted roots.
  const clientPems = await selfsigned.generate(
    [{ name: "commonName", value: "grpc-internal-client" }],
    { days: 365, algorithm: "sha256", keySize: 2048 },
  );

  writeFileSync(keyFile, pems.private);
  writeFileSync(certFile, pems.cert);
  writeFileSync(clientKeyFile, clientPems.private);
  writeFileSync(clientCertFile, clientPems.cert);
  writeFileSync(caFile, pems.cert + clientPems.cert);
}

console.log("Generated certificates in packages/certificates/:");
console.log("  key.pem            — server private key");
console.log("  cert.pem           — server certificate");
console.log("  client-key.pem     — gRPC client private key");
console.log("  client-cert.pem    — gRPC client certificate");
console.log("  rootCA.pem         — CA root certificate");
