import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Halaman yang hanya boleh diakses superadmin (bukan divisi_admin)
const SUPERADMIN_ONLY_PATHS = [
    '/admin/statistics',
    '/admin/uptime',
    '/admin/notifications',
    '/admin/roles',
    '/admin/audit-log',
    '/admin/share-links',
    '/admin/categories',
];

export async function middleware(request: NextRequest) {
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
        pathname.startsWith('/models/') ||      // Aset 3D statis intro (GLB/HDR); boleh di-cache browser
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

    // 5. RBAC Guard di /admin — hanya superadmin dan divisi_admin yang boleh masuk,
    // serta blokir divisi_admin dari halaman sensitif (SUPERADMIN_ONLY_PATHS).
    if (nextAuthSession && pathname.startsWith('/admin')) {
        try {
            const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
            const secureCookie = Boolean(request.cookies.get('__Secure-authjs.session-token'));
            const token = await getToken({
                req: request,
                secret,
                secureCookie,
                cookieName: secureCookie ? '__Secure-authjs.session-token' : 'authjs.session-token',
            });
            if (token && 'appRole' in token) {
                const appRole = token.appRole as string | null | undefined;
                if (appRole !== 'superadmin' && appRole !== 'divisi_admin') {
                    const url = request.nextUrl.clone();
                    url.pathname = '/categories';
                    return NextResponse.redirect(url);
                }
                if (appRole === 'divisi_admin' && SUPERADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
                    const url = request.nextUrl.clone();
                    url.pathname = '/admin';
                    return NextResponse.redirect(url);
                }
            }
        } catch {
            // Gagal decode token → biarkan lewat; page & API guard tetap menegakkan akses.
        }
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
