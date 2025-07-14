// Step 4: Get credentials from WebAuthn API
export async function getCredential(options) {
  return await navigator.credentials.get({
    publicKey: options,
  });
}
