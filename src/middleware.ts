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
        pathname.startsWith('/api/auth') ||         // NextAuth & PIN auth endpoints
        pathname.startsWith('/api/share-links/verify') || // Public share link verification
        pathname.startsWith('/api/stats/track') ||  // Public analytics tracking
        (pathname === '/api/settings/notifications' && request.method === 'GET') || // Public read of notice config (shared view)
        pathname.startsWith('/static') ||
        pathname.startsWith('/shared') ||       // Shared CCTV links (public, token-verified in page)
        pathname === '/login' ||
        pathname === '/favicon.ico' ||
        pathname === '/Panduan-Input-Detail-Proyek.pdf' || // Panduan pengguna (tautan di halaman login)
        /\.(svg|png|jpg|jpeg|gif|ico|webp|woff2?|ttf|css|js)$/.test(pathname)
    ) {
        return NextResponse.next();
    }

    // 3. API routes and stream files — require auth cookie
    if (pathname.startsWith('/api') || pathname.startsWith('/streams')) {
        const pinToken = request.cookies.get('auth_token');
        const nextAuthSession = request.cookies.get('authjs.session-token') ||
                                request.cookies.get('__Secure-authjs.session-token');

        if (!pinToken && !nextAuthSession) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized. Please log in.' },
                { status: 401 }
            );
        }
        return NextResponse.next();
    }

    // 3. Auth Guard — check EITHER PIN cookie OR NextAuth session
    const pinToken = request.cookies.get('auth_token');
    const nextAuthSession = request.cookies.get('authjs.session-token') ||
                            request.cookies.get('__Secure-authjs.session-token');

    if (!pinToken && !nextAuthSession) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        const response = NextResponse.redirect(url);
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return response;
    }

    // 4. Admin Guard — restrict /admin to SSO users only
    if (pathname.startsWith('/admin') && !nextAuthSession && pinToken) {
        const url = request.nextUrl.clone();
        url.pathname = '/categories';
        return NextResponse.redirect(url);
    }

    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
