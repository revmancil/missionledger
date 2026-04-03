/**
 * JSON.stringify for API bodies: avoids TypeError on BigInt (common with some pg numeric paths).
 */
export function stringifyJsonForApi(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "bigint") return Number(v);
    return v;
  });
}
