import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow long-running MCP requests
  serverExternalPackages: ['@modelcontextprotocol/sdk'],
};

export default nextConfig;
