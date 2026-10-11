import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import AppRole from '@/models/AppRole';
import Location from '@/models/Location';
import PinSession from '@/models/PinSession';
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
    // Check PIN-based authentication (cookie set by /api/auth/verify).
    // Token sekarang opaque + server-backed: hanya lolos bila ada PinSession
    // yang masih hidup. Nilai konstanta lama ('authenticated') TIDAK diterima.
    const pinToken = req.cookies.get('auth_token');
    if (pinToken?.value) {
        await dbConnect();
        const live = await PinSession.exists({
            token: pinToken.value,
            expiresAt: { $gt: new Date() },
        });
        if (live) {
            return null; // Authenticated via PIN
        }
        // Token tidak dikenal / sudah kedaluwarsa → fall through ke SSO.
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

/** IP klien dari header proxy (ambil hop pertama di x-forwarded-for). */
function clientIp(req: NextRequest): string {
    const fwd = req.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Extract actor identifier for audit logging.
 *
 * AuditLog.by adalah string, jadi identitas kaya (nama/email + cognito_sub + IP)
 * dikemas ke satu string agar jejak audit bisa menautkan tindakan ke user SSO
 * tertentu dan asal permintaannya. Contoh:
 *   "Budi <budi@contoh.id> (sub:abc-123, ip:10.0.0.5)"
 */
export async function getAuditActor(req: NextRequest): Promise<string> {
    const ip = clientIp(req);
    const session = await auth();

    if (session?.user) {
        const name = session.user.name || session.user.email || 'SSO';
        const email = session.user.email;
        const sub = (session.user.id as string | undefined) || undefined;
        const label = email && email !== name ? `${name} <${email}>` : name;
        const meta = [sub ? `sub:${sub}` : null, `ip:${ip}`].filter(Boolean).join(', ');
        return `${label} (${meta})`;
    }

    // Cabang PIN efektif mati untuk route admin (requireAdmin menolak PIN), tapi
    // dipertahankan untuk route level requireAuth yang mungkin mencatat audit.
    const pinToken = req.cookies.get('auth_token');
    if (pinToken?.value) {
        return `Admin (PIN) (ip:${ip})`;
    }

    return `admin (ip:${ip})`;
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
 * Identitas sesi SSO: { sub, username }. username dipakai untuk mencocokkan
 * PIC yang masih berformat placeholder `ldap_<username>` (dari direktori SSO
 * eksternal) sebelum user bersangkutan pernah login ke aplikasi yang menuliskan
 * sub asli. PIN → { sub: null, username: null }.
 */
export async function getSessionIdentity(): Promise<{ sub: string | null; username: string | null }> {
    const session = await auth();
    const u = session?.user as { id?: string; username?: string | null } | undefined;
    return {
        sub: (u?.id as string) || null,
        username: (u?.username as string | null) ?? null,
    };
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
 * Apakah identitas (sub/username) berhak sebagai PIC proyek berdasarkan picSubs.
 * - match: true bila sub asli ADA di picSubs, ATAU placeholder `ldap_<username>` ADA.
 * - placeholder: nilai `ldap_<username>` yang cocok (bila lewat jalur username),
 *   dipakai pemanggil untuk self-heal (ganti → sub asli). null bila match via sub.
 *
 * Satu sumber kebenaran agar GET (gating UI) dan guard tulis konsisten.
 */
export function matchProjectPic(
    picSubs: string[],
    identity: { sub: string | null; username: string | null },
): { match: boolean; placeholder: string | null } {
    const subs = Array.isArray(picSubs) ? picSubs : [];
    if (identity.sub && subs.includes(identity.sub)) return { match: true, placeholder: null };
    if (identity.username) {
        const placeholder = `ldap_${identity.username}`;
        if (subs.includes(placeholder)) return { match: true, placeholder };
    }
    return { match: false, placeholder: null };
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
    const { sub, username } = await getSessionIdentity();
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
        const { match, placeholder } = matchProjectPic(picSubs, { sub, username });

        if (match) {
            // SELF-HEAL: bila lolos lewat placeholder `ldap_<username>`, ganti
            // dengan sub asli agar lookup berikutnya langsung cocok via sub.
            if (placeholder) {
                try {
                    const healed = [...new Set(picSubs.map((s) => (s === placeholder ? sub : s)))];
                    await Location.updateOne({ _id: loc._id }, { $set: { picSubs: healed } });
                } catch (healErr) {
                    // Self-heal gagal tidak boleh menolak akses yang sudah sah.
                    console.warn('[requireProjectAccess] self-heal gagal:', (healErr as { message?: string })?.message);
                }
            }
            return null;
        }

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
