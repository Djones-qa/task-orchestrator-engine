import crypto from 'node:crypto';

/**
 * Computes an HMAC-SHA256 signature for a given payload and secret.
 * Returns the hex-encoded signature string.
 */
export function computeSignature(payload: Buffer, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Validates an HMAC-SHA256 signature from a request header against
 * a computed signature for the given payload and secret.
 *
 * Handles the `sha256=` prefix stripping from the signature header.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @returns true if the signature is valid, false otherwise.
 */
export function validateSignature(
  payload: Buffer,
  signatureHeader: string,
  secret: string
): boolean {
  const expectedSignature = computeSignature(payload, secret);

  // Strip the `sha256=` prefix if present
  const providedSignature = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;

  // Both signatures must be valid hex of the same length for timingSafeEqual
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const providedBuffer = Buffer.from(providedSignature, 'hex');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
