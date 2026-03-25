import { NextRequest, NextResponse } from 'next/server';

// Routes that require a valid auth_token cookie
const PROTECTED_PREFIXES = ['/store', '/admin'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(prefix =>
    pathname.startsWith(prefix)
  );

  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get('auth_token')?.value;

  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/store/:path*', '/admin/:path*'],
};
