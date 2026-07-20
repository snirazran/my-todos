import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  const isAuth = !!token;
  const isAuthRoute =
    req.nextUrl.pathname.startsWith('/welcome') ||
    req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname.startsWith('/register') ||
    req.nextUrl.pathname.startsWith('/auth') ||
    req.nextUrl.pathname.startsWith('/api/auth');

  // Onboarding runs before any account exists (account creation is deferred to
  // the final step), so it must be reachable regardless of auth state.
  if (req.nextUrl.pathname.startsWith('/onboarding')) {
    return NextResponse.next();
  }

  // The root route serves a public product homepage to signed-out visitors and
  // the task dashboard to authenticated users. Keep it reachable so OAuth
  // reviewers and prospective users can understand the app without an account.
  const isPublicHomepage = req.nextUrl.pathname === '/';

  if (!isAuth && !isAuthRoute && !isPublicHomepage) {
    // Check if it's a public path or asset not caught by matcher
    // For now, rely on config matcher to only run on protected routes.
    const welcomeUrl = new URL('/welcome', req.url);
    const ref = req.nextUrl.searchParams.get('ref');
    const friend = req.nextUrl.searchParams.get('friend');
    if (ref) welcomeUrl.searchParams.set('ref', ref);
    if (friend) welcomeUrl.searchParams.set('friend', friend);
    return NextResponse.redirect(welcomeUrl);
  }

  // If user IS authenticated and tries to access login/register, redirect to home.
  // Guests (anonymous auth) also carry a session cookie, so the upgrade flow
  // must stay reachable for them.
  const isUpgradeFlow =
    req.nextUrl.pathname.startsWith('/login') &&
    req.nextUrl.searchParams.get('upgrade') === '1';
  if (isAuth && isAuthRoute && !isUpgradeFlow) {
    const homeUrl = new URL('/', req.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Be specific to avoid blocking static assets and public routes.
  matcher: ['/', '/manage-tasks/:path*', '/api/user/:path*', '/welcome', '/login', '/register', '/onboarding'],
};
