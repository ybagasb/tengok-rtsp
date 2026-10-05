import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import Category from '@/models/Category';
import { requireAuth } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const DIVISIONS = ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'] as const;

/**
 * GET /api/divisions  (auth required)
 *
 * Mengembalikan hierarki Divisi (lapisan di atas kategori). Divisi melekat pada
 * dokumen Location (Location.division); daftar kategori per divisi diturunkan
 * runtime dari kategori proyek yang ada di divisi tersebut.
 *
 * Response:
 * [
 *   {
 *     division: 'DIVISI 1',
 *     projectCount: 16,
 *     categories: [ { ...Category, projectCount } ]
 *   }, ...
 * ]
 */
export async function GET(req: NextRequest) {
    const authError = await requireAuth(req);
    if (authError) return authError;

    await dbConnect();

    try {
        // Hitung jumlah proyek per (division, category) dalam satu agregasi.
        const grouped = await Location.aggregate([
            { $match: { division: { $in: DIVISIONS } } },
            { $group: { _id: { division: '$division', category: '$category' }, count: { $sum: 1 } } },
        ]);

        const allCategories = await Category.find().lean() as any[];
        const catByIdentifier = new Map(allCategories.map(c => [c.identifier, c]));

        const result = DIVISIONS.map(div => {
            const rows = grouped.filter(g => g._id.division === div);
            const projectCount = rows.reduce((acc, r) => acc + r.count, 0);
            const categories = rows
                .map(r => {
                    const cat = catByIdentifier.get(r._id.category);
                    if (!cat) return null;
                    return { ...cat, projectCount: r.count };
                })
                .filter(Boolean);
            return { division: div, projectCount, categories };
        });

        return NextResponse.json({ success: true, data: result });
    } catch (error: any) {
        console.error('[Divisions GET] Error:', error?.message);
        return NextResponse.json({ success: false, error: 'Gagal memuat data divisi' }, { status: 500 });
    }
}
