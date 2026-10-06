const MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes; refusing longer input avoids silently weakening it.
const MAX_BYTES = 72;

// The handful of passwords that show up in every breach list.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "12345678", "123456789",
  "1234567890", "qwertyui", "qwerty123", "qwertyuiop", "iloveyou", "11111111", "00000000",
  "abc12345", "letmein1", "welcome1", "missionledger", "changeme", "admin1234",
]);

/** Returns a user-facing message when the password is unacceptable, else null. */
export function passwordPolicyError(password: unknown): string | null {
  if (typeof password !== "string" || !password) return "Password is required.";
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (Buffer.byteLength(password, "utf8") > MAX_BYTES) return `Password must be at most ${MAX_BYTES} bytes long.`;
  if (COMMON.has(password.toLowerCase())) return "That password is too common. Please choose a different one.";
  return null;
}
