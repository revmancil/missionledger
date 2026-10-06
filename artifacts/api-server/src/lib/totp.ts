import crypto from "crypto";

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s step) — the default every authenticator app supports. */
const STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totpAt(secretBase32: string, timeMs: number): string {
  return hotp(base32Decode(secretBase32), Math.floor(timeMs / 1000 / STEP_SECONDS));
}

/**
 * Returns the matched time-step (so the caller can refuse to accept it a second time) or
 * null. Accepts one step of clock drift either way. Comparison is constant-time.
 */
export function verifyTotp(
  secretBase32: string,
  code: unknown,
  opts: { now?: number; lastUsedStep?: number | null } = {},
): number | null {
  if (typeof code !== "string") return null;
  const submitted = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(submitted)) return null;
  const secret = base32Decode(secretBase32);
  const nowStep = Math.floor((opts.now ?? Date.now()) / 1000 / STEP_SECONDS);
  let matched: number | null = null;
  for (const step of [nowStep - 1, nowStep, nowStep + 1]) {
    const expected = Buffer.from(hotp(secret, step));
    const given = Buffer.from(submitted);
    if (crypto.timingSafeEqual(expected, given) && matched === null) matched = step;
  }
  if (matched === null) return null;
  if (opts.lastUsedStep != null && matched <= opts.lastUsedStep) return null;
  return matched;
}

export function otpauthUri(secretBase32: string, account: string, issuer = "MissionLedger"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
