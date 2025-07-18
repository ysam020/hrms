export async function getCredential(options) {
  return await navigator.credentials.get({
    publicKey: options,
  });
}
