// Gmail (and its googlemail.com alias) ignores dots in the local part of the
// address, so "sameer.y020@gmail.com" and "sameery.020@gmail.com" are the
// same inbox. Google's OAuth profile can report either spelling depending on
// how the user is signed in, and the KYC form lets a user retype their own
// email — without normalizing both paths to the same canonical form, they
// can drift apart and login stops matching the stored record, silently
// spinning up a second, tenant-less account for the same person.
export function canonicalizeEmail(rawEmail: string): string {
  const trimmed = rawEmail.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex === -1) return trimmed;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.replace(/\./g, "")}@gmail.com`;
  }
  return trimmed;
}
