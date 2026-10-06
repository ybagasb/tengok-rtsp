import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import AppRole from '@/models/AppRole';
import Location from '@/models/Location';
import dbConnect from '@/lib/db';

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
 *
 * Admin access requires a NextAuth (Cognito SSO) session ONLY. PIN auth is a
 * fast-access viewer credential and must NOT grant admin — otherwise anyone
 * with the PIN could hit admin APIs directly, bypassing the /admin page guard
 * in middleware. This mirrors the intended design: PIN = viewer, SSO = admin.
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
    // SSO session is the only path to admin. Deliberately does NOT accept the
    // PIN cookie (unlike requireAuth).
    const session = await auth();
    if (session?.user) {
        return null; // Authenticated via SSO
    }

    return NextResponse.json(
        { success: false, error: 'Akses admin memerlukan login SSO.' },
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

// ── RBAC berbasis kepemilikan (PIC & super-admin) ─────────────────────────────
//
// Jalur otorisasi di bawah ini TIDAK PERNAH menyentuh Postgres (ssoUsers.ts).
// Keputusan izin 100% dari data milik TENGOK: env bootstrap, AppRole (Mongo),
// dan Location.picSubs (Mongo). Ini membuat sistem fail-safe terhadap outage
// Postgres dan — untuk bootstrap admin — bahkan terhadap outage MongoDB.

/** Set cognito_sub bootstrap dari env (split koma, trim, buang kosong). */
function bootstrapSubs(): Set<string> {
    return new Set(
        (process.env.TENGOK_BOOTSTRAP_ADMIN_SUBS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    );
}

/** True bila sub termasuk daftar bootstrap env (dicek SEBELUM akses DB apa pun). */
export function isBootstrapAdmin(cognitoSub: string): boolean {
    return !!cognitoSub && bootstrapSubs().has(cognitoSub);
}

/** True bila sub ada di env bootstrap ATAU punya entri AppRole superadmin. */
export async function isSuperAdmin(cognitoSub?: string | null): Promise<boolean> {
    if (!cognitoSub) return false;
    if (isBootstrapAdmin(cognitoSub)) return true;      // tanpa menyentuh DB (anti-lockout)
    await dbConnect();
    const row = await AppRole.exists({ cognitoSub, role: 'superadmin' });
    return !!row;
}

/** cognito_sub dari sesi SSO, atau null bila tak ada sesi SSO (PIN → null). */
export async function getSessionSub(): Promise<string | null> {
    const session = await auth();
    return (session?.user?.id as string) || null;
}

/**
 * Guard super-admin. PIN tidak pernah lolos (getSessionSub hanya baca sesi SSO).
 * Return null bila lolos, atau NextResponse 403.
 */
export async function requireSuperAdmin(req: NextRequest): Promise<NextResponse | null> {
    void req; // guard tidak butuh req, tapi jaga tanda tangan konsisten dengan guard lain
    const sub = await getSessionSub();
    if (!sub) {
        return NextResponse.json(
            { success: false, error: 'Akses ini memerlukan login SSO.' },
            { status: 403 },
        );
    }
    if (!(await isSuperAdmin(sub))) {
        return NextResponse.json(
            { success: false, error: 'Hanya super-admin yang dapat melakukan tindakan ini.' },
            { status: 403 },
        );
    }
    return null;
}

/**
 * Guard akses tulis proyek. Lolos (null) bila super-admin ATAU sub ∈ picSubs proyek.
 *
 * Pemilik SATU-SATUNYA try/catch di sekitar findById/isSuperAdmin:
 *  - projectId tak valid (CastError) → 404 (id tak dikenal = tidak ditemukan).
 *  - Mongo unreachable / error lain → 503 DENIAL (tidak pernah pass).
 */
export async function requireProjectAccess(
    req: NextRequest,
    projectId: string,
): Promise<NextResponse | null> {
    void req;
    const sub = await getSessionSub();
    if (!sub) {
        return NextResponse.json(
            { success: false, error: 'Akses edit proyek memerlukan login SSO.' },
            { status: 403 },
        );
    }

    try {
        const superAdmin = await isSuperAdmin(sub);
        await dbConnect();
        const loc = await Location.findById(projectId).select('_id picSubs').lean() as
            | { _id: unknown; picSubs?: string[] }
            | null;

        if (!loc) {
            return NextResponse.json(
                { success: false, error: 'Proyek tidak ditemukan' },
                { status: 404 },
            );
        }

        if (superAdmin) return null;

        const picSubs = Array.isArray(loc.picSubs) ? loc.picSubs : [];
        if (picSubs.includes(sub)) return null;

        return NextResponse.json(
            { success: false, error: 'Anda tidak memiliki akses untuk mengubah proyek ini.' },
            { status: 403 },
        );
    } catch (err) {
        if ((err as { name?: string })?.name === 'CastError') {
            return NextResponse.json(
                { success: false, error: 'Proyek tidak ditemukan' },
                { status: 404 },
            );
        }
        console.error('[requireProjectAccess] Error:', (err as { message?: string })?.message);
        // Mongo outage / error tak terduga → DENIAL, bukan pass.
        return NextResponse.json(
            { success: false, error: 'Layanan tidak tersedia, coba lagi nanti.' },
            { status: 503 },
        );
    }
}
