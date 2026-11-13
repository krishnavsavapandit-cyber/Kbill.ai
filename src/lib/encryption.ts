import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derives a consistent 32-byte (256-bit) encryption key from the environment.
 * Uses ENCRYPTION_SECRET, or falls back to AUTH_SECRET with SHA-256 hashing.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.AUTH_SECRET || "default_super_secret_for_businessos_ai_encryption_key_2026";
  return crypto.createHash("sha256").update(secret.trim()).digest();
}

/**
 * Encrypts a sensitive string (e.g. API keys, secrets, access tokens) using AES-256-GCM.
 * Output format: `enc:v1:<iv_hex>:<authTag_hex>:<cipherText_hex>`
 */
export function encryptSecret(plaintext?: string | null): string | null {
  if (!plaintext || typeof plaintext !== "string" || plaintext.trim() === "") {
    return null;
  }

  const trimmed = plaintext.trim();
  // Don't re-encrypt if already encrypted
  if (trimmed.startsWith("enc:v1:")) {
    return trimmed;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(trimmed, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `enc:v1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted secret.
 * If the input is not encrypted (e.g. legacy plain text), returns it as-is for backward compatibility.
 */
export function decryptSecret(ciphertext?: string | null): string | null {
  if (!ciphertext || typeof ciphertext !== "string" || ciphertext.trim() === "") {
    return null;
  }

  const trimmed = ciphertext.trim();
  if (!trimmed.startsWith("enc:v1:")) {
    return trimmed; // Plaintext fallback
  }

  const parts = trimmed.split(":");
  if (parts.length !== 5) {
    throw new Error("Invalid encrypted secret format.");
  }

  const [, version, ivHex, authTagHex, encryptedHex] = parts;
  if (version !== "v1") {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Utility to check if a stored string is encrypted
 */
export function isEncrypted(value?: string | null): boolean {
  return typeof value === "string" && value.startsWith("enc:v1:");
}
