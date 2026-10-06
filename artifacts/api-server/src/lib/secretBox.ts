import crypto from "crypto";

/**
 * Application-level encryption for secrets stored in the database (Plaid access tokens,
 * MFA seeds), so a database leak alone does not expose them. AES-256-GCM, with the key in
 * APP_ENCRYPTION_KEY (64 hex characters or base64 of 32 bytes).
 *
 * Stored format: "enc:v1:<iv>:<authTag>:<ciphertext>" (base64). Values without the prefix
 * are treated as legacy plaintext so existing rows keep working until they are re-saved.
 */
const PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters, or base64).");
  }
  return key;
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

let warned = false;

/**
 * Encrypts when a key is configured. Without one it returns the value unchanged (so
 * integrations keep working) and logs a warning — set APP_ENCRYPTION_KEY to turn
 * encryption on. Pass `required: true` for secrets that must never be stored in the clear.
 */
export function encryptSecret(plain: string, opts: { required?: boolean } = {}): string {
  const key = getKey();
  if (!key) {
    if (opts.required) {
      throw new Error("APP_ENCRYPTION_KEY is not set; refusing to store this secret unencrypted.");
    }
    if (!warned) {
      warned = true;
      console.warn("[secretBox] APP_ENCRYPTION_KEY is not set — secrets are being stored unencrypted.");
    }
    return plain;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const key = getKey();
  if (!key) throw new Error("Encrypted value found but APP_ENCRYPTION_KEY is not set.");
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed encrypted value.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
