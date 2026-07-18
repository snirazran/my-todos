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

  // If user is not authenticated and tries to access protected route
  // We'll let the client handle some redirects, but for critical paths we can redirect here.
  // actually, let's keep the logic simple: if not auth and not on auth route, redirect to login.
  // BUT we need to be careful about public assets or api routes that don't need auth.
  // The config matcher handles specific paths.

  // Onboarding runs before any account exists (account creation is deferred to
  // the final step), so it must be reachable regardless of auth state.
  if (req.nextUrl.pathname.startsWith('/onboarding')) {
    return NextResponse.next();
  }

  // Allow logged-out users to preview the home page via /?guest=1
  const isGuestPreview =
    req.nextUrl.pathname === '/' && req.nextUrl.searchParams.has('guest');

  if (!isAuth && !isAuthRoute && !isGuestPreview) {
    // Check if it's a public path or asset not caught by matcher
    // For now, rely on config matcher to only run on protected routes.
    // But wait, matcher includes '/' which is home.
    // If home is protected, then redirect.
    // If home is public, we shouldn't redirect.

    // Original logic: if (!isAuth && !isAuthRoute) -> redirect login.
    // This implies home '/' requires login.
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
  // Be specific to avoid blocking static assets or other open routes
  matcher: ['/', '/manage-tasks/:path*', '/api/user/:path*', '/welcome', '/login', '/register', '/onboarding'],
  // Exclude public api routes if any? /api/auth is in isAuthRoute check.
  // Note: /api/skins usually requires auth but maybe we handle it in route?
  // Let's protect /api/skins as well if possible, or leave it to route handler.
  // Original matcher was ['/manage-tasks/:path*', '/api/:path*', '/']
  // If '/' is protected, then yes, keep it.
};
