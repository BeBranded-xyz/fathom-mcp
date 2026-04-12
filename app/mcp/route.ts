import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { decrypt } from '@/lib/crypto';
import { registerTools } from '@/lib/mcp-tools';

const handler = createMcpHandler(
  (server) => {
    // Register tools without a FathomClient — they'll get the API key
    // from extra.authInfo.token at call time (passed by the MCP transport)
    registerTools(server);
  },
  { serverInfo: { name: 'fathom-mcp', version: '1.0.0' } },
  { maxDuration: 120, verboseLogs: true }
);

const authed = withMcpAuth(
  handler,
  async (_req: Request, bearerToken?: string) => {
    if (!bearerToken) return undefined;
    try {
      decrypt(bearerToken); // validate it decrypts
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
