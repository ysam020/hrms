// Step 5: Serialize credential for backend verification
export function serializeCredential(credential) {
  return {
    id: credential.id,
    type: credential.type,
    rawId: Array.from(new Uint8Array(credential.rawId)),
    response: {
      authenticatorData: Array.from(
        new Uint8Array(credential.response.authenticatorData)
      ),
      clientDataJSON: Array.from(
        new Uint8Array(credential.response.clientDataJSON)
      ),
      signature: Array.from(new Uint8Array(credential.response.signature)),
      userHandle: credential.response.userHandle
        ? Array.from(new Uint8Array(credential.response.userHandle))
        : null,
    },
  };
}
