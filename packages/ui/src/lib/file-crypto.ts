/**
 * Client-side file encryption/decryption using AES-GCM 256-bit
 * via the Web Crypto API. The server never sees plaintext file data.
 */

/** Encrypted file result. */
export interface EncryptedFile {
  /** Encrypted bytes. */
  ciphertext: ArrayBuffer;
  /** 12-byte nonce (base64). */
  nonce: string;
  /** Encryption key ID (base64-encoded key for now). */
  keyId: string;
}

/** Generate a random AES-256-GCM key. */
async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can export it
    ['encrypt', 'decrypt'],
  );
}

/** Export a CryptoKey to base64. */
async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

/** Import a base64-encoded key. */
async function importKey(base64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'raw', raw, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
}

/**
 * Encrypt a file's contents with a fresh AES-256-GCM key.
 * Returns the ciphertext, nonce, and key ID.
 */
export async function encryptFile(data: ArrayBuffer): Promise<EncryptedFile> {
  const key = await generateKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    data,
  );

  const keyId = await exportKey(key);
  const nonceBase64 = btoa(String.fromCharCode(...nonce));

  return { ciphertext, nonce: nonceBase64, keyId };
}

/**
 * Decrypt an encrypted file.
 */
export async function decryptFile(
  ciphertext: ArrayBuffer,
  nonceBase64: string,
  keyBase64: string,
): Promise<ArrayBuffer> {
  const key = await importKey(keyBase64);
  const nonce = Uint8Array.from(atob(nonceBase64), (c) => c.charCodeAt(0));

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    ciphertext,
  );
}
