import { encrypt } from '@/lib/crypto';
import { signAuthCode } from '@/lib/jwt';

function renderForm(params: URLSearchParams, error?: string): Response {
  const clientId = params.get('client_id') || '';
  const redirectUri = params.get('redirect_uri') || '';
  const state = params.get('state') || '';
  const codeChallenge = params.get('code_challenge') || '';
  const codeChallengeMethod = params.get('code_challenge_method') || 'S256';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect to Fathom</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 2rem; max-width: 420px; width: 100%; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: #fafafa; }
    p { font-size: 0.875rem; color: #a3a3a3; margin-bottom: 1.5rem; line-height: 1.5; }
    label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.5rem; color: #d4d4d4; }
    input[type="text"] { width: 100%; padding: 0.625rem 0.75rem; background: #0a0a0a; border: 1px solid #404040; border-radius: 8px; color: #fafafa; font-size: 0.875rem; font-family: monospace; }
    input[type="text"]:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2); }
    button { width: 100%; padding: 0.625rem; background: #7c3aed; color: white; border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer; margin-top: 1rem; }
    button:hover { background: #6d28d9; }
    .error { background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.8125rem; color: #fca5a5; }
    .info { font-size: 0.75rem; color: #737373; margin-top: 1rem; text-align: center; }
    .info a { color: #a78bfa; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect to Fathom</h1>
    <p>Enter your Fathom API key to connect your account. Your key is encrypted and never stored in plain text.</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="code_challenge" value="${codeChallenge}">
      <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}">
      <label for="api_key">Fathom API Key</label>
      <input type="text" id="api_key" name="api_key" placeholder="fathom_..." required autocomplete="off">
      <button type="submit">Connect Account</button>
    </form>
    <p class="info">Get your API key from <a href="https://fathom.video/settings" target="_blank">Fathom Settings</a></p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return renderForm(url.searchParams);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const apiKey = formData.get('api_key') as string;
  const clientId = formData.get('client_id') as string;
  const redirectUri = formData.get('redirect_uri') as string;
  const state = formData.get('state') as string;
  const codeChallenge = formData.get('code_challenge') as string;
  const codeChallengeMethod = formData.get('code_challenge_method') as string;

  if (!apiKey || !redirectUri || !codeChallenge) {
    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('redirect_uri', redirectUri);
    params.set('state', state);
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', codeChallengeMethod);
    return renderForm(params, 'API key is required.');
  }

  // Validate the API key by making a test call to Fathom
  try {
    const testResponse = await fetch('https://api.fathom.ai/external/v1/teams', {
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    });
    if (!testResponse.ok) {
      const params = new URLSearchParams();
      params.set('client_id', clientId);
      params.set('redirect_uri', redirectUri);
      params.set('state', state);
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', codeChallengeMethod);
      return renderForm(params, 'Invalid API key. Please check your key and try again.');
    }
  } catch {
    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('redirect_uri', redirectUri);
    params.set('state', state);
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', codeChallengeMethod);
    return renderForm(params, 'Could not reach Fathom API. Please try again.');
  }

  // Encrypt the API key and generate an auth code
  const encryptedKey = encrypt(apiKey);
  const code = signAuthCode({
    encrypted_key: encryptedKey,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  });

  // Redirect back to Claude with the auth code
  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) {
    redirect.searchParams.set('state', state);
  }

  return Response.redirect(redirect.toString(), 302);
}
