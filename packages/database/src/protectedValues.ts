/**
 * Typed reads of protected numeric, date and boolean fields. Their Prisma
 * type is Json (the stored value is ciphertext), but the field-protection
 * hook returns the original number, Date or boolean, so these only restore
 * the static type. A legacy plaintext value is converted the same way.
 */
export function protectedNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function protectedDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function protectedBoolean(v: unknown): boolean | null {
  return typeof v === "boolean"
    ? v
    : v === null || v === undefined
      ? null
      : Boolean(v);
}
