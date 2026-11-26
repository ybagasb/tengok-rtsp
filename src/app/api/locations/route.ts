import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
// Side-effect import: registers the Camera model so populate('cameras') works
import '@/models/Camera';
import { logAudit } from '@/lib/adminAuditLog';
import {
    requireAuth, requireDivisiAdmin, areCamerasAccessibleByDivisi, getAuditActor,
} from '@/lib/apiAuth';

import '@/lib/cameraStatusChecker';


// Field yang boleh ditulis lewat create/update lokasi. Allowlist ini SENGAJA
// tidak memuat picSubs (field kontrol akses, hanya diset oleh route PIC yang
// dijaga super-admin) maupun _id/createdAt/updatedAt. Body di PUT/POST hanya
// disalin untuk key di sini — mencegah eskalasi privilese lewat body mentah.
const LOCATION_EDITABLE_FIELDS = [
    // Peta / CCTV
    'name', 'category', 'description', 'image', 'lat', 'lng', 'pmName', 'pmPhone', 'cameras',
    // Hierarki organisasi
    'division', 'projectType',
    // Identitas proyek
    'penggunaJasa', 'pengawas', 'penyediaJasa',
    'contractor', 'startDate', 'endDate', 'contractNumber', 'contractValue',
    // Progress fisik + keuangan
    'progressPercent', 'progressRencana', 'progressDeviasi', 'progressPeriode', 'progressKeuangan', 'tagihanBelumDiproses',
    // Ikhtiar
    'cpi', 'spi', 'ccc',
    // Finansial (ringkas)
    'tagihanBruto', 'cashIn', 'cashOut', 'saldoKas', 'saldoHutang', 'bad', 'piutang', 'bebanKonstruksi', 'hasilUsaha',
    // Operasi (ringkas)
    'pu', 'bk', 'lk',
    // Daftar operasional & legal
    'lingkupPekerjaan', 'sumberDaya', 'monitoringPengadaan', 'changeManagement',
    'milestones', 'status',
] as const;

/**
 * Salin HANYA key yang masuk allowlist dari body. picSubs tidak pernah ada di
 * allowlist; untuk aman ganda, hapus eksplisit bila entah bagaimana tersisip.
 */
function pickEditableFields(body: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of LOCATION_EDITABLE_FIELDS) {
        if (field in body) out[field] = body[field];
    }
    // Pertahanan ganda: picSubs adalah kontrol akses, tidak boleh lewat sini.
    delete out.picSubs;
    return out;
}

/**
 * Strip streamUrl from populated camera objects to avoid credential leakage.
 */
function sanitizeCameras<T extends { cameras?: unknown }>(obj: T): T {
    if (obj?.cameras && Array.isArray(obj.cameras)) {
        obj.cameras = obj.cameras.map((cam: Record<string, unknown>) =>
            // Drop streamUrl (copy of all other own props, same as rest-destructuring)
            Object.fromEntries(Object.entries(cam).filter(([key]) => key !== 'streamUrl'))
        );
    }
    return obj;
}

interface LocationWithCamerasLean {
    cameras?: Array<{ status?: string }>;
    [key: string]: unknown;
}

interface ValidationLikeError {
    name?: string;
    message?: string;
    errors?: Record<string, { message?: string } | undefined>;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope');
    const category = searchParams.get('category');
    const division = searchParams.get('division');
    const projectType = searchParams.get('projectType');
    const id = searchParams.get('id');

    // Mode ?scope=admin dipakai oleh halaman manajemen admin (/admin/*):
    // membatasi akses ke superadmin / divisi_admin dan otomatis memfilter divisi.
    let adminDivisi: string | null = null;
    if (scope === 'admin') {
        const authResult = await requireDivisiAdmin(req);
        if ('error' in authResult) return authResult.error;
        if (!authResult.isSuperAdmin) adminDivisi = authResult.divisi;
    } else {
        const authError = await requireAuth(req);
        if (authError) return authError;
    }

    await dbConnect();

    try {
        if (id) {
            const location = await Location.findById(id)
                .populate('cameras')
                .lean<LocationWithCamerasLean & { division?: string }>();
            if (!location) {
                return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
            }
            if (adminDivisi && location.division !== adminDivisi) {
                return NextResponse.json({ success: false, error: 'Proyek ini di luar cakupan divisi Anda' }, { status: 403 });
            }
            return NextResponse.json({ success: true, data: sanitizeCameras(location) });
        }

        const query: Record<string, string | { $in: string[] }> = {};
        if (category) {
            // Beberapa kategori dipisah koma (mis. grup Sekolah: "sekolah-rakyat,sekolah").
            const cats = category.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 10);
            query.category = cats.length > 1 ? { $in: cats } : (cats[0] ?? category);
        }
        if (adminDivisi) {
            query.division = adminDivisi;
        } else if (division) {
            query.division = division;
        }
        if (projectType) query.projectType = projectType;
        const locations = await Location.find(query).populate('cameras').lean<LocationWithCamerasLean[]>();

        // Calculate online/offline counts and strip credentials
        const enhancedLocations = locations.map((loc) => {
            const onlineCount = loc.cameras?.filter((c) => c.status === 'online').length || 0;
            const offlineCount = loc.cameras?.filter((c) => c.status === 'offline').length || 0;
            return {
                ...sanitizeCameras(loc),
                onlineCount,
                offlineCount
            };
        });

        return NextResponse.json({ success: true, data: enhancedLocations });
    } catch (error) {
        console.error('[Locations GET] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ success: false, error: 'Gagal memuat data lokasi' }, { status: 500 });
    }
}

// Return a user-friendly message for Mongoose validation errors (field-level,
// safe to show), otherwise a generic message. Never leak internal error text.
function errorResponse(error: unknown, fallback: string, status = 500) {
    const err = error as ValidationLikeError | null | undefined;
    console.error(`[Locations] ${fallback}:`, err?.message);
    if (err?.name === 'ValidationError') {
        const first = Object.values(err.errors || {})[0];
        const msg = first?.message || 'Data tidak valid';
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: fallback }, { status });
}

export async function POST(req: NextRequest) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    await dbConnect();

    try {
        const body = await req.json();
        const data = pickEditableFields(body);

        // Divisi admin wajib terikat ke divisinya sendiri dan hanya boleh menautkan kamera divisinya.
        if (!isSuperAdmin && callerDivisi) {
            data.division = callerDivisi;
            if (Array.isArray(data.cameras) && data.cameras.length > 0) {
                const camIds = data.cameras.map(String);
                if (!(await areCamerasAccessibleByDivisi(camIds, callerDivisi))) {
                    return NextResponse.json(
                        { success: false, error: 'Terdapat kamera yang bukan milik divisi Anda' },
                        { status: 403 },
                    );
                }
            }
        }

        const actor = await getAuditActor(req);
        // Hanya field allowlist yang boleh dibuat — picSubs tidak dapat disisipkan.
        const location = await Location.create(data);

        await logAudit({
            action: 'CREATE',
            entity: 'Location',
            entityId: location._id.toString(),
            entityName: location.name,
            by: actor,
            detail: `Created location: ${location.name} (${location.category})`,
        });

        return NextResponse.json({ success: true, data: location }, { status: 201 });
    } catch (error) {
        return errorResponse(error, 'Gagal menyimpan lokasi', 400);
    }
}

export async function DELETE(req: NextRequest) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    try {
        const existing = await Location.findById(id).select('name division').lean<{ name?: string; division?: string }>();
        if (!existing) {
            return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
        }
        if (!isSuperAdmin && existing.division !== callerDivisi) {
            return NextResponse.json({ success: false, error: 'Anda tidak memiliki akses menghapus proyek divisi lain' }, { status: 403 });
        }

        const actor = await getAuditActor(req);
        const deletedLocation = await Location.findByIdAndDelete(id);
        if (!deletedLocation) {
            return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
        }

        await logAudit({
            action: 'DELETE',
            entity: 'Location',
            entityId: id,
            entityName: deletedLocation.name,
            by: actor,
            detail: `Deleted location: ${deletedLocation.name}`,
        });

        return NextResponse.json({ success: true, data: {} }, { status: 200 });
    } catch (error) {
        return errorResponse(error, 'Gagal menghapus lokasi');
    }
}

export async function PUT(req: NextRequest) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    await dbConnect();

    try {
        const body = await req.json();
        const _id = body?._id;

        if (!_id) {
            return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
        }

        const existing = await Location.findById(_id).select('division').lean<{ division?: string }>();
        if (!existing) {
            return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
        }
        if (!isSuperAdmin && existing.division !== callerDivisi) {
            return NextResponse.json({ success: false, error: 'Anda tidak memiliki akses mengubah proyek divisi lain' }, { status: 403 });
        }

        // Hanya field allowlist yang ditulis. picSubs (kontrol akses), _id,
        // createdAt, updatedAt sengaja tidak pernah masuk update.
        const updateData = pickEditableFields(body);
        if (!isSuperAdmin && callerDivisi) {
            // Divisi admin tidak dapat memindahkan proyek ke divisi lain
            updateData.division = callerDivisi;
            if (Array.isArray(updateData.cameras) && updateData.cameras.length > 0) {
                const camIds = updateData.cameras.map(String);
                if (!(await areCamerasAccessibleByDivisi(camIds, callerDivisi))) {
                    return NextResponse.json(
                        { success: false, error: 'Terdapat kamera yang bukan milik divisi Anda' },
                        { status: 403 },
                    );
                }
            }
        }

        const actor = await getAuditActor(req);
        const location = await Location.findByIdAndUpdate(_id, updateData, { new: true, runValidators: true });

        if (!location) {
            return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
        }

        await logAudit({
            action: 'UPDATE',
            entity: 'Location',
            entityId: _id,
            entityName: location.name,
            by: actor,
            detail: `Updated location: ${location.name}`,
        });

        return NextResponse.json({ success: true, data: location });
    } catch (error) {
        return errorResponse(error, 'Gagal memperbarui lokasi', 400);
    }
}
