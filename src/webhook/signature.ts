/**
 * Ed25519 Signature Verification for QQ Webhook
 *
 * QQ uses Ed25519 signatures to verify webhook requests.
 * The bot secret (appSecret) is used as the seed to generate the Ed25519 key pair.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

// Configure ed25519 to use sha512
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

/**
 * Derive Ed25519 seed from bot secret
 * QQ repeats the secret string until it reaches 32 bytes, then takes the first 32 bytes
 *
 * From QQ's Go code:
 *   seed := botSecret
 *   for len(seed) < ed25519.SeedSize {
 *       seed = strings.Repeat(seed, 2)
 *   }
 *   seed = seed[:ed25519.SeedSize]
 */
function deriveSeed(botSecret: string): Uint8Array {
  // Repeat the secret until it's at least 32 bytes
  let seed = botSecret;
  while (seed.length < 32) {
    seed = seed + seed; // Double the string
  }
  // Take the first 32 bytes
  const seedBytes = new TextEncoder().encode(seed.slice(0, 32));
  return seedBytes;
}

/**
 * Generate Ed25519 private key from bot secret
 */
export function getPrivateKey(botSecret: string): Uint8Array {
  return deriveSeed(botSecret);
}

/**
 * Generate Ed25519 public key from bot secret
 */
export function getPublicKey(botSecret: string): Uint8Array {
  const privateKey = getPrivateKey(botSecret);
  return ed.getPublicKey(privateKey);
}

/**
 * Verify an incoming webhook request signature
 *
 * @param signature - The signature from X-Signature-Ed25519 header (hex string)
 * @param timestamp - The timestamp from X-Signature-Timestamp header
 * @param body - The raw request body
 * @param botSecret - The bot's appSecret
 * @returns True if signature is valid
 */
export function verifySignature(
  signature: string,
  timestamp: string,
  body: string,
  botSecret: string
): boolean {
  try {
    // The message to verify is: timestamp + body
    const message = timestamp + body;
    const messageBytes = new TextEncoder().encode(message);

    // Convert hex signature to bytes
    const signatureBytes = hexToBytes(signature);

    // Get public key from bot secret
    const publicKey = getPublicKey(botSecret);

    // Verify the signature
    return ed.verify(signatureBytes, messageBytes, publicKey);
  } catch (error) {
    console.error('[QQ-Channel] Signature verification error:', error);
    return false;
  }
}

/**
 * Sign a message for URL validation callback response
 *
 * @param eventTs - The event timestamp from the validation request
 * @param plainToken - The plain_token from the validation request
 * @param botSecret - The bot's appSecret
 * @returns Hex string of the signature
 */
export function signCallbackResponse(
  eventTs: string,
  plainToken: string,
  botSecret: string
): string {
  // The message to sign is: eventTs + plainToken
  const message = eventTs + plainToken;
  const messageBytes = new TextEncoder().encode(message);

  // Get private key from bot secret
  const privateKey = getPrivateKey(botSecret);

  // Sign the message
  const signature = ed.sign(messageBytes, privateKey);

  // Return hex string
  return bytesToHex(signature);
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
