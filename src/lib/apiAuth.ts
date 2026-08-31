import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Verify that the incoming API request is authenticated.
 * Checks for either:
 *   1. NextAuth session (Cognito SSO) via the `auth()` helper
 *   2. PIN-based auth via `auth_token` cookie
 *
 * Returns null if authenticated, or a 401 NextResponse if not.
 */
export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
    // Check PIN-based authentication (cookie set by /api/auth/verify)
    const pinToken = req.cookies.get('auth_token');
    if (pinToken?.value === 'authenticated') {
        return null; // Authenticated via PIN
    }

    // Check NextAuth (Cognito SSO) session
    const session = await auth();
    if (session?.user) {
        return null; // Authenticated via SSO
    }

    // Not authenticated
    return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
    );
}

/**
 * Check if the request is from an authorized admin user.
 * Supports both NextAuth SSO session and PIN-based authenticated admin session.
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
    // Check PIN-based authentication
    const pinToken = req.cookies.get('auth_token');
    if (pinToken?.value === 'authenticated') {
        return null; // Authenticated via PIN (local admin)
    }

    // Check NextAuth (Cognito SSO) session
    const session = await auth();
    if (session?.user) {
        return null; // Authenticated via SSO
    }

    return NextResponse.json(
        { success: false, error: 'Admin access required. Please log in.' },
        { status: 403 }
    );
}

/**
 * Extract actor identifier for audit logging.
 */
export async function getAuditActor(req: NextRequest): Promise<string> {
    const session = await auth();
    if (session?.user?.name) return session.user.name;
    if (session?.user?.email) return session.user.email;

    const pinToken = req.cookies.get('auth_token');
    if (pinToken?.value === 'authenticated') {
        return 'Admin (PIN)';
    }

    return 'admin';
}
