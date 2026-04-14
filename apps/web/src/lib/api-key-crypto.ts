import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET ?? process.env.INTERNAL_API_SECRET;

  if (!secret) {
    throw new Error("API key encryption is not configured");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(apiKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptApiKey(encryptedValue: string | null | undefined): string | null {
  if (!encryptedValue) {
    return null;
  }

  const [iv, authTag, payload] = encryptedValue.split(".");

  if (!iv || !authTag || !payload) {
    return null;
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(authTag, "base64url"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload, "base64url")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
