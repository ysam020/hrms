// Step 3: Convert data format for WebAuthn API
export function formatLoginOptions(options) {
  options.challenge = new Uint8Array(
    options.challenge.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
  );
  options.allowCredentials.forEach((cred) => {
    cred.id = new Uint8Array(cred.id.data);
  });
  return options;
}
