/**
 * Coerce DB/driver values (Date, ISO string, number) to a Date or null.
 * Never throws — avoids TypeError when code assumes Date but pg returns a string.
 */
export function asDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  try {
    const d = new Date(value as string | number);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** ISO 8601 for JSON; invalid dates → epoch (never throws). */
export function toIsoString(value: unknown): string {
  try {
    const d = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(d.getTime())) return new Date(0).toISOString();
    return d.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

/** Optional timestamps; invalid → null (never throws). */
export function toIsoStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  try {
    const d = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}
