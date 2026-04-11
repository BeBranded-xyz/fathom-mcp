import { createHmac } from 'crypto';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

function base64url(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf.toString('base64url');
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

interface AuthCodePayload {
  encrypted_key: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  exp: number;
}

export function signAuthCode(payload: Omit<AuthCodePayload, 'exp'>): string {
  const secret = getJwtSecret();
  const fullPayload: AuthCodePayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
  };

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(fullPayload));
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

export function verifyAuthCode(token: string): AuthCodePayload {
  const secret = getJwtSecret();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid auth code format');
  }

  const [header, body, signature] = parts;
  const expectedSig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  if (signature !== expectedSig) {
    throw new Error('Invalid auth code signature');
  }

  const payload: AuthCodePayload = JSON.parse(base64urlDecode(body));

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Auth code expired');
  }

  return payload;
}
