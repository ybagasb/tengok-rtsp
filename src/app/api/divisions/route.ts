import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import Category from '@/models/Category';
import Camera from '@/models/Camera';
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
 * Ditambah: cameraTotal & cameraOnline per divisi & per kategori untuk indikator status CCTV.
 *
 * Response:
 * [
 *   {
 *     division: 'DIVISI 1',
 *     projectCount: 16,
 *     cameraTotal: 12,
 *     cameraOnline: 8,
 *     categories: [ { ...Category, projectCount, cameraTotal, cameraOnline } ]
 *   }, ...
 * ]
 */
export async function GET(req: NextRequest) {
    const authError = await requireAuth(req);
    if (authError) return authError;

    await dbConnect();

    try {
        // 1. Hitung jumlah proyek per (division, category)
        const grouped = await Location.aggregate([
            { $match: { division: { $in: DIVISIONS } } },
            { $group: { _id: { division: '$division', category: '$category' }, count: { $sum: 1 } } },
        ]);

        // 2. Ambil data kamera per location & status kamera saat ini (2 query ringan)
        const locations = (await Location.find({ division: { $in: DIVISIONS } })
            .select('division category cameras')
            .lean()) as Array<{ division?: string; category?: string; cameras?: unknown[] }>;

        const cameras = (await Camera.find({})
            .select('_id status')
            .lean()) as Array<{ _id: unknown; status?: string }>;

        const statusById = new Map<string, string>();
        for (const cam of cameras) {
            if (cam._id) {
                statusById.set(String(cam._id), cam.status || 'offline');
            }
        }

        // 3. Kumpulkan ID kamera unik per (division, category) & per division untuk deduplikasi
        const catCameraSets = new Map<string, Set<string>>();
        const divCameraSets = new Map<string, Set<string>>();

        for (const div of DIVISIONS) {
            divCameraSets.set(div, new Set<string>());
        }

        for (const loc of locations) {
            if (!loc.division) continue;
            const divSet = divCameraSets.get(loc.division);
            const catKey = `${loc.division}::${loc.category}`;
            let catSet = catCameraSets.get(catKey);
            if (!catSet) {
                catSet = new Set<string>();
                catCameraSets.set(catKey, catSet);
            }

            if (Array.isArray(loc.cameras)) {
                for (const camId of loc.cameras) {
                    if (!camId) continue;
                    const idStr = String(camId);
                    divSet?.add(idStr);
                    catSet.add(idStr);
                }
            }
        }

        // Helper untuk menghitung total kamera unik dan yang online
        const countCameras = (idSet?: Set<string>) => {
            if (!idSet || idSet.size === 0) return { total: 0, online: 0 };
            let online = 0;
            for (const id of idSet) {
                if (statusById.get(id) === 'online') {
                    online++;
                }
            }
            return { total: idSet.size, online };
        };

        const allCategories = (await Category.find().lean()) as Array<{ identifier?: string } & Record<string, unknown>>;
        const catByIdentifier = new Map(allCategories.map(c => [c.identifier, c]));

        const result = DIVISIONS.map(div => {
            const rows = grouped.filter(g => g._id.division === div);
            const projectCount = rows.reduce((acc, r) => acc + r.count, 0);
            const divCam = countCameras(divCameraSets.get(div));

            const categories = rows
                .map(r => {
                    const cat = catByIdentifier.get(r._id.category);
                    if (!cat) return null;
                    const catCam = countCameras(catCameraSets.get(`${div}::${r._id.category}`));
                    return {
                        ...cat,
                        projectCount: r.count,
                        cameraTotal: catCam.total,
                        cameraOnline: catCam.online,
                    };
                })
                .filter(Boolean);

            return {
                division: div,
                projectCount,
                cameraTotal: divCam.total,
                cameraOnline: divCam.online,
                categories,
            };
        });

        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        console.error('[Divisions GET] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ success: false, error: 'Gagal memuat data divisi' }, { status: 500 });
    }
}
