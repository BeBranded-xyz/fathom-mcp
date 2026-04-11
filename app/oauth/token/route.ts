import { createHash } from 'crypto';
import { verifyAuthCode } from '@/lib/jwt';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';

  let grantType: string | null = null;
  let code: string | null = null;
  let codeVerifier: string | null = null;

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();
    grantType = formData.get('grant_type') as string;
    code = formData.get('code') as string;
    codeVerifier = formData.get('code_verifier') as string;
  } else {
    const body = await request.json();
    grantType = body.grant_type;
    code = body.code;
    codeVerifier = body.code_verifier;
  }

  if (grantType !== 'authorization_code') {
    return Response.json(
      { error: 'unsupported_grant_type', error_description: 'Only authorization_code is supported' },
      { status: 400 }
    );
  }

  if (!code || !codeVerifier) {
    return Response.json(
      { error: 'invalid_request', error_description: 'code and code_verifier are required' },
      { status: 400 }
    );
  }

  // Verify the JWT auth code
  let payload;
  try {
    payload = verifyAuthCode(code);
  } catch (err) {
    return Response.json(
      { error: 'invalid_grant', error_description: (err as Error).message },
      { status: 400 }
    );
  }

  // Validate PKCE: S256(code_verifier) must match code_challenge
  if (payload.code_challenge_method === 'S256') {
    const expectedChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    if (expectedChallenge !== payload.code_challenge) {
      return Response.json(
        { error: 'invalid_grant', error_description: 'PKCE verification failed' },
        { status: 400 }
      );
    }
  }

  // The access token IS the encrypted API key
  return Response.json({
    access_token: payload.encrypted_key,
    token_type: 'bearer',
    scope: 'fathom',
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
