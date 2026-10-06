import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getSessionSub, isSuperAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/me/access
 * Endpoint ringan untuk UI gating. Mengembalikan apakah pengguna saat ini
 * super-admin. Hanya untuk menyembunyikan/menampilkan tombol — BUKAN kontrol
 * akses otoritatif (guard /admin/* di middleware + requireAdmin tetap berlaku).
 * Viewer PIN tidak punya sesi SSO → getSessionSub() null → isSuperAdmin false.
 */
export async function GET(req: NextRequest) {
    const authError = await requireAuth(req);
    if (authError) return authError;

    const sub = await getSessionSub();           // null untuk viewer PIN
    const superAdmin = await isSuperAdmin(sub);  // isSuperAdmin menerima null → false
    return NextResponse.json({ isSuperAdmin: superAdmin });
}
