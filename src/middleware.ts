import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // 1. Priority Redirects
    if (pathname.toLowerCase() === '/direksi') {
        const url = request.nextUrl.clone();
        url.pathname = '/categories';
        return NextResponse.redirect(url);
    }

    // Redirect root to login
    if (pathname === '/') {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    // 2. Paths that are always accessible (No Auth)
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api') ||
        pathname.startsWith('/static') ||
        pathname.startsWith('/streams') ||      // HLS video segments
        pathname.startsWith('/shared') ||       // Shared CCTV links (public)
        pathname === '/categories' ||
        pathname === '/multiview' ||
        pathname === '/map' ||
        pathname === '/login' ||
        pathname === '/favicon.ico'
    ) {
        return NextResponse.next();
    }

    // 3. Auth Guard
    const authToken = request.cookies.get('auth_token');

    if (!authToken) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
