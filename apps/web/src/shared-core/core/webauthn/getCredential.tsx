export async function getCredential(
  options: PublicKeyCredentialRequestOptions,
) {
  return await navigator.credentials.get({
    publicKey: options,
  });
}
