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
 * Check if the request is from an SSO (admin) user.
 * Returns the session if admin, or a 403 NextResponse if not.
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
    // First check basic auth
    const authError = await requireAuth(req);
    if (authError) return authError;

    // Admin = SSO users only
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json(
            { success: false, error: 'Admin access required.' },
            { status: 403 }
        );
    }

    return null;
}
