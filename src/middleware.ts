import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '');

  const { pathname } = req.nextUrl;

  const isAdmin = pathname.startsWith('/admin');
  const isStore = pathname.startsWith('/store');

  if (!isAdmin && !isStore) return NextResponse.next();

  const token = req.cookies.get('auth_token')?.value;

  // No token → redirect to login
  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Decode and verify token
  let role: string | undefined;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    role = payload.role as string | undefined;
  } catch {
    // Invalid/expired token → send to login
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes require superadmin role
  if (isAdmin && role !== 'superadmin') {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Store routes require store role
  if (isStore && role !== 'store') {
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
