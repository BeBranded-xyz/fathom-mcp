import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { decrypt } from '@/lib/crypto';
import { registerTools } from '@/lib/mcp-tools';
import { apiKeyStore } from '@/lib/request-context';

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  { serverInfo: { name: 'fathom-mcp', version: '1.0.0' } },
  { maxDuration: 120 }
);

function getAuthedHandler() {
  return withMcpAuth(
    (req: Request) => {
      const token = req.auth?.token;
      if (!token) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      }
      try {
        const apiKey = decrypt(token);
        return apiKeyStore.run(apiKey, () => handler(req));
      } catch {
        return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 });
      }
    },
    async (_req: Request, bearerToken?: string) => {
      if (!bearerToken) return undefined;
      try {
        decrypt(bearerToken);
        return { token: bearerToken, clientId: 'fathom-user', scopes: ['fathom'] };
      } catch {
        return undefined;
      }
    },
    {
      required: true,
      resourceMetadataPath: '/.well-known/oauth-protected-resource',
    }
  );
}

let _authed: ReturnType<typeof getAuthedHandler> | null = null;
function authed(req: Request) {
  if (!_authed) _authed = getAuthedHandler();
  return _authed(req);
}

export { authed as GET, authed as POST, authed as DELETE };

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
