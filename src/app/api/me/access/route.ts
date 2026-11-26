import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getCallerRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/me/access
 * Endpoint ringan untuk UI gating. Mengembalikan peran & divisi pengguna saat ini.
 * Hanya untuk menyembunyikan/menampilkan tombol & menu — BUKAN kontrol
 * akses otoritatif (guard /admin/* di middleware + requireSuperAdmin/requireDivisiAdmin tetap berlaku).
 * Viewer PIN tidak punya sesi SSO → role null → isAdmin false, isSuperAdmin false.
 */
export async function GET(req: NextRequest) {
    const authError = await requireAuth(req);
    if (authError) return authError;

    const caller = await getCallerRole();
    const isAdmin = caller.role === 'superadmin' || caller.role === 'divisi_admin';
    return NextResponse.json({
        isSuperAdmin: caller.isSuperAdmin,
        isAdmin,
        appRole: caller.role,
        appDivisi: caller.divisi,
    });
}
