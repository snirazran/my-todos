import { NextResponse } from 'next/server';

const BUNDLE_ID = 'io.frog.tasks';

export function GET() {
  const teamId = process.env.APNS_TEAM_ID?.trim() ?? '';
  const appId = `${teamId}.${BUNDLE_ID}`;

  const body = {
    applinks: {
      details: [
        {
          appIDs: [appId],
          components: [{ '/': '*' }],
        },
      ],
    },
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  });
}
