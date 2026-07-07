import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/firebaseAdmin';

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  let idToken: unknown;
  try {
    ({ idToken } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (typeof idToken !== 'string' || !idToken) {
    return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
  }

  try {
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    });

    const cookieStore = await cookies();
    const secure = process.env.NODE_ENV === 'production';
    const maxAge = Math.floor(SESSION_DURATION_MS / 1000);

    cookieStore.set('token', sessionCookie, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
    cookieStore.set('session_exp', String(Date.now() + SESSION_DURATION_MS), {
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error creating session cookie:', error);
    return NextResponse.json({ error: 'Invalid ID token' }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set('token', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  cookieStore.set('session_exp', '', {
    path: '/',
    maxAge: 0,
  });
  return NextResponse.json({ ok: true });
}
