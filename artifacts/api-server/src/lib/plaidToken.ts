import { db, bankAccounts } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret, isEncrypted, isEncryptionConfigured } from "./secretBox";

/**
 * Plaintext Plaid access token for a linked account. Tokens are stored encrypted; rows saved
 * before encryption was configured are plaintext, and get encrypted in place the first time
 * they are used once APP_ENCRYPTION_KEY is set.
 */
export async function readAccessToken(account: { id: string; plaidAccessToken: string }): Promise<string> {
  const plain = decryptSecret(account.plaidAccessToken);
  if (!isEncrypted(account.plaidAccessToken) && isEncryptionConfigured()) {
    await db.update(bankAccounts)
      .set({ plaidAccessToken: encryptSecret(plain) })
      .where(eq(bankAccounts.id, account.id))
      .catch((e) => console.error("Could not encrypt stored Plaid token:", e?.message));
  }
  return plain;
}
