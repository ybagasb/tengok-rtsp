"use client";

import { SessionProvider, useSession } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import RouteTransition from './RouteTransition';

// Protected routes that require authentication
const PROTECTED_ROUTES = ['/intro', '/categories', '/map', '/multiview', '/admin'];

/**
 * Check if the current path is a protected route
 */
function isProtectedPath(path: string): boolean {
    return PROTECTED_ROUTES.some(route => path.startsWith(route));
}

/**
 * Check client-readable auth flags (works for both PIN and SSO flows).
 * NOTE: authjs.session-token is httpOnly and CANNOT be read via document.cookie.
 * That's why we use 'sso_flag' as a client-readable indicator for SSO users.
 */
function hasClientAuthFlag(): boolean {
    const hasPinCookie = document.cookie.includes('auth_flag');
    const hasSsoCookie = document.cookie.includes('sso_flag');
    return hasPinCookie || hasSsoCookie;
}

/**
 * Verify session on the server side by calling the NextAuth session endpoint.
 * This is the reliable check since session cookies are httpOnly.
 */
async function verifySessionServer(): Promise<boolean> {
    try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (!res.ok) return false;
        const data = await res.json();
        // If session has a user object, it's valid
        return !!(data && data.user);
    } catch {
        // Network error — don't redirect, could be transient
        return true;
    }
}

function AuthStateSync() {
    const { status } = useSession();
    const pathname = usePathname();
    const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isRedirectingRef = useRef(false);

    /**
     * Safely redirect to login — debounced to avoid race conditions.
     * Verifies server-side session before actually redirecting.
     */
    const safeRedirectToLogin = useCallback(async () => {
        // Prevent multiple simultaneous redirect checks
        if (isRedirectingRef.current) return;
        isRedirectingRef.current = true;

        try {
            // Double-check with server before redirecting
            const isValid = await verifySessionServer();
            if (!isValid && !hasClientAuthFlag()) {
                window.location.href = '/login';
            }
        } finally {
            isRedirectingRef.current = false;
        }
    }, []);

    useEffect(() => {
        // 1. Handle BFCache (Back-Forward Cache): Force reload when page is restored from cache
        const handlePageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                window.location.reload();
            }
        };

        // 2. Handle visibility change: When user switches back to this tab, verify auth
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                if (isProtectedPath(pathname)) {
                    // Quick client check first, then verify server-side if needed
                    if (!hasClientAuthFlag()) {
                        safeRedirectToLogin();
                    }
                }
            }
        };

        // 3. Handle popstate (browser back/forward navigation)
        const handlePopState = () => {
            if (isProtectedPath(window.location.pathname)) {
                if (!hasClientAuthFlag()) {
                    safeRedirectToLogin();
                }
            }
        };

        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('popstate', handlePopState);
            if (redirectTimeoutRef.current) {
                clearTimeout(redirectTimeoutRef.current);
            }
        };
    }, [pathname, safeRedirectToLogin]);

    // 4. If NextAuth session becomes unauthenticated while on a protected page,
    //    debounce the redirect to avoid reacting to brief transient states.
    useEffect(() => {
        if (redirectTimeoutRef.current) {
            clearTimeout(redirectTimeoutRef.current);
            redirectTimeoutRef.current = null;
        }

        if (status === 'unauthenticated') {
            if (isProtectedPath(pathname)) {
                // Debounce: wait 2 seconds before checking, in case
                // the session is just briefly refreshing/revalidating
                redirectTimeoutRef.current = setTimeout(() => {
                    if (!hasClientAuthFlag()) {
                        safeRedirectToLogin();
                    }
                }, 2000);
            }
        }

        return () => {
            if (redirectTimeoutRef.current) {
                clearTimeout(redirectTimeoutRef.current);
            }
        };
    }, [status, pathname, safeRedirectToLogin]);

    return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider
            // Refetch session every 5 minutes to keep it alive
            refetchInterval={5 * 60}
            refetchOnWindowFocus={true}
        >
            <AuthStateSync />
            <RouteTransition />
            {children}
            <Toaster
                position="top-right"
                toastOptions={{
                    duration: 3000,
                    style: {
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(16px)',
                        color: '#f8fafc',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '16px',
                        padding: '14px 20px',
                        fontSize: '14px',
                        fontWeight: '600',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
                    },
                    success: {
                        iconTheme: {
                            primary: '#eab308',
                            secondary: '#0f172a',
                        },
                    },
                    error: {
                        iconTheme: {
                            primary: '#ef4444',
                            secondary: '#0f172a',
                        },
                    },
                }}
            />
        </SessionProvider>
    );
}
