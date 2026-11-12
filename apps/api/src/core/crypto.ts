import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM for IBANs and customer contact data (PRD NFR: encrypted at rest).
// DATA_KEY is 32 bytes, base64. Generate with: openssl rand -base64 32
function key(): Buffer {
  const raw = process.env.DATA_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('DATA_KEY is required in production');
    return createHash('sha256').update('ananda-agents-dev-only-key').digest();
  }
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('DATA_KEY must be 32 bytes (base64)');
  return k;
}

export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function decrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  const [v, iv, tag, body] = value.split('.');
  if (v !== 'v1') throw new Error('Unknown ciphertext version');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
