import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import { requireDivisiAdmin } from '@/lib/apiAuth';
import {
    DIVISI_LIST, DIMENSI_LABELS, PENGISIAN_FIELDS, hitungBaris, isDivisiKey,
    type BarisPengisian, type DivisiKey, type PengisianResponse, type PengisianSumber,
} from '@/lib/pengisian';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/pengisian
 * Rekap pengisian data proyek (18 dimensi) untuk Divisi 1, 2, dan 3.
 * Super-admin melihat semua divisi; divisi_admin hanya melihat divisinya sendiri.
 */
export async function GET(req: NextRequest) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    await dbConnect();

    try {
        const filter = !isSuperAdmin && callerDivisi ? { division: callerDivisi } : {};
        const docs = await Location.find(filter)
            .select(`${PENGISIAN_FIELDS} division`)
            .sort({ category: 1, name: 1 })
            .lean<(PengisianSumber & { division?: string })[]>();

        const divisi = Object.fromEntries(DIVISI_LIST.map(d => [d, [] as BarisPengisian[]])) as Record<DivisiKey, BarisPengisian[]>;
        let tanpaDivisi = 0;
        for (const doc of docs) {
            if (isDivisiKey(doc.division)) divisi[doc.division].push(hitungBaris(doc));
            else if (isSuperAdmin) tanpaDivisi++;
        }

        const body: PengisianResponse & { scopedDivisi?: DivisiKey | null } = {
            success: true,
            generatedAt: new Date().toISOString(),
            dimensi: [...DIMENSI_LABELS],
            divisi,
            tanpaDivisi,
            scopedDivisi: isSuperAdmin ? null : (callerDivisi as DivisiKey),
        };
        return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[pengisian] API error:', error);
        return NextResponse.json({ success: false, error: 'Gagal memuat rekap pengisian' }, { status: 500 });
    }
}
