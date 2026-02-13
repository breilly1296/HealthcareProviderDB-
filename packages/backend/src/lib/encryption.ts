import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function parseKey(b64: string, label: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `${label} must decode to exactly ${KEY_LENGTH} bytes, got ${key.length}`
    );
  }
  return key;
}

/** Primary key — used for all encryption and first-attempt decryption. */
function getEncryptionKey(): Buffer {
  const b64 = process.env.INSURANCE_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "INSURANCE_ENCRYPTION_KEY environment variable is not set"
    );
  }
  return parseKey(b64, "INSURANCE_ENCRYPTION_KEY");
}

/** Previous key — used only as a decryption fallback during key rotation. */
function getPreviousEncryptionKey(): Buffer | null {
  const b64 = process.env.INSURANCE_ENCRYPTION_KEY_PREVIOUS;
  if (!b64) return null;
  return parseKey(b64, "INSURANCE_ENCRYPTION_KEY_PREVIOUS");
}

/** Returns true when a previous (rotation) key is configured. */
export function hasPreviousKey(): boolean {
  return !!process.env.INSURANCE_ENCRYPTION_KEY_PREVIOUS;
}

// ============================================================================
// Core encrypt / decrypt
// ============================================================================

export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt a single ciphertext value using a specific key. */
function decryptWithKey(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format: expected iv:authTag:data");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Decrypt a ciphertext string.
 *
 * Tries the primary key first. If that fails (e.g. auth tag mismatch after
 * key rotation) and a previous key is configured, retries with the previous
 * key. If both fail, throws a generic error to avoid leaking crypto internals.
 */
export function decrypt(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null) return null;

  const primaryKey = getEncryptionKey();

  try {
    return decryptWithKey(ciphertext, primaryKey);
  } catch (primaryError) {
    const previousKey = getPreviousEncryptionKey();
    if (previousKey) {
      try {
        return decryptWithKey(ciphertext, previousKey);
      } catch {
        // Previous key also failed — fall through to generic error
      }
    }

    // Never expose raw crypto error details (auth tag mismatch, invalid format, etc.)
    throw new Error('Decryption failed');
  }
}

// ============================================================================
// Card PII helpers
// ============================================================================

interface CardPiiPlaintext {
  subscriber_id?: string | null;
  group_number?: string | null;
  rxbin?: string | null;
  rxpcn?: string | null;
  rxgrp?: string | null;
}

interface CardPiiEncrypted {
  subscriberIdEnc: string | null;
  groupNumberEnc: string | null;
  rxbinEnc: string | null;
  rxpcnEnc: string | null;
  rxgrpEnc: string | null;
}

export function encryptCardPii(fields: CardPiiPlaintext): CardPiiEncrypted {
  return {
    subscriberIdEnc: encrypt(fields.subscriber_id),
    groupNumberEnc: encrypt(fields.group_number),
    rxbinEnc: encrypt(fields.rxbin),
    rxpcnEnc: encrypt(fields.rxpcn),
    rxgrpEnc: encrypt(fields.rxgrp),
  };
}

export function decryptCardPii(fields: CardPiiEncrypted): CardPiiPlaintext {
  return {
    subscriber_id: decrypt(fields.subscriberIdEnc),
    group_number: decrypt(fields.groupNumberEnc),
    rxbin: decrypt(fields.rxbinEnc),
    rxpcn: decrypt(fields.rxpcnEnc),
    rxgrp: decrypt(fields.rxgrpEnc),
  };
}
