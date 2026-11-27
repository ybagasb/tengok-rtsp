import { NextRequest, NextResponse } from 'next/server';
import { requireDivisiAdmin } from '@/lib/apiAuth';
import { searchUsers } from '@/lib/ssoUsers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/sso-users/search?q=&limit=  (superadmin atau divisi_admin)
 * Proxy pencarian direktori user SSO (read-only). Field display saja.
 * Postgres gagal/tak dikonfigurasi → 503 (gagal halus, tidak menyentuh otorisasi).
 */
export async function GET(req: NextRequest) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;

    const q = req.nextUrl.searchParams.get('q') || '';
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = limitParam != null ? Number(limitParam) : undefined;

    try {
        const users = await searchUsers(q, { activeOnly: true, limit });
        return NextResponse.json({ success: true, data: users });
    } catch (err) {
        console.warn('[sso-users/search] Postgres tidak tersedia:', (err as { message?: string })?.message);
        return NextResponse.json(
            { success: false, error: 'Direktori user SSO tidak tersedia saat ini.' },
            { status: 503 },
        );
    }
}
