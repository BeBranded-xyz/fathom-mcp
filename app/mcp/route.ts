import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { decrypt } from '@/lib/crypto';
import { FathomClient } from '@/src/fathom-client';
import { registerTools } from '@/lib/mcp-tools';
import { getBaseUrl } from '@/lib/base-url';

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function unauthorizedResponse(): Response {
  const baseUrl = getBaseUrl();
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: {
      'WWW-Authenticate': `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

async function handleMcpRequest(request: Request): Promise<Response> {
  // Validate auth
  const token = extractBearerToken(request);
  if (!token) {
    return unauthorizedResponse();
  }

  let apiKey: string;
  try {
    apiKey = decrypt(token);
  } catch {
    return unauthorizedResponse();
  }

  // Create per-request server and client
  const fathom = new FathomClient(apiKey);
  const server = new McpServer({
    name: 'fathom-mcp',
    version: '1.0.0',
  });
  registerTools(server, fathom);

  // Create stateless transport (no session ID generator = stateless)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}

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
