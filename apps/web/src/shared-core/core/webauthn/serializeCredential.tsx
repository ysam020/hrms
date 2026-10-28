export function serializeCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    type: credential.type,
    rawId: Array.from(new Uint8Array(credential.rawId)),
    response: {
      authenticatorData: Array.from(new Uint8Array(response.authenticatorData)),
      clientDataJSON: Array.from(new Uint8Array(response.clientDataJSON)),
      signature: Array.from(new Uint8Array(response.signature)),
      userHandle: response.userHandle
        ? Array.from(new Uint8Array(response.userHandle))
        : null,
    },
  };
}
