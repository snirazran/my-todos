import { NextResponse } from 'next/server';
import { SCOPES } from '@/lib/apiTokens';
import { mcpResourceUrl, oauthIssuer } from '@/lib/oauth/keys';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version',
};

export async function GET() {
  return NextResponse.json(
    {
      resource: mcpResourceUrl(),
      authorization_servers: [oauthIssuer()],
      scopes_supported: [...SCOPES],
      bearer_methods_supported: ['header'],
    },
    { headers: CORS },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
