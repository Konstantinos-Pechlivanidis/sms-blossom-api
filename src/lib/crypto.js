import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function hmacSha256(key, data) {
  return createHmac('sha256', key).update(data).digest('hex');
}

export function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// AES-256-GCM helpers for storing tokens (ENCRYPTION_KEY must be 32 bytes base64)
export function encryptToBytes(plaintext) {
  const keyB64 = process.env.ENCRYPTION_KEY;
  if (!keyB64) throw new Error('ENCRYPTION_KEY is required');
  const key = Buffer.from(keyB64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decryptFromBytes(cipherBytes) {
  const keyB64 = process.env.ENCRYPTION_KEY;
  if (!keyB64) throw new Error('ENCRYPTION_KEY is required');
  const key = Buffer.from(keyB64, 'base64');
  const iv = cipherBytes.subarray(0, 12);
  const tag = cipherBytes.subarray(12, 28);
  const enc = cipherBytes.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

// AES-256-GCM string helpers storing format gcm::<iv_b64>::<tag_b64>::<data_b64>
function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is required');
  // support hex or base64
  const isHex = /^[0-9a-fA-F]+$/.test(raw) && raw.length === 64;
  return isHex ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
}

export function encryptToString(plaintext) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm::${iv.toString('base64')}::${tag.toString('base64')}::${enc.toString('base64')}`;
}

export function decryptFromString(ciphertext) {
  if (!ciphertext || !ciphertext.startsWith('gcm::')) throw new Error('Invalid ciphertext format');
  const [, ivB64, tagB64, dataB64] = ciphertext.split('::');
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}
