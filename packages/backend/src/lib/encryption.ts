import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const b64 = process.env.INSURANCE_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "INSURANCE_ENCRYPTION_KEY environment variable is not set"
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `INSURANCE_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes, got ${key.length}`
    );
  }
  return key;
}

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

export function decrypt(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null) return null;

  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format: expected iv:authTag:data");
  }

  const key = getEncryptionKey();
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
