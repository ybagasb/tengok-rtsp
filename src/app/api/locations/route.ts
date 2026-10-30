import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
// Side-effect import: registers the Camera model so populate('cameras') works
import '@/models/Camera';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAuth, requireAdmin, getAuditActor } from '@/lib/apiAuth';

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
    'lingkupPekerjaan', 'sumberDaya', 'isuStrategis', 'kendala', 'monitoringPengadaan', 'changeManagement',
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
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const division = searchParams.get('division');
    const projectType = searchParams.get('projectType');
    const id = searchParams.get('id');

    try {
        if (id) {
            const location = await Location.findById(id).populate('cameras').lean();
            if (!location) {
                return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
            }
            return NextResponse.json({ success: true, data: sanitizeCameras(location) });
        }

        const query: Record<string, string> = {};
        if (category) query.category = category;
        if (division) query.division = division;
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
    // Only admin can create locations
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();

    try {
        const body = await req.json();
        const actor = await getAuditActor(req);
        // Hanya field allowlist yang boleh dibuat — picSubs tidak dapat disisipkan.
        const location = await Location.create(pickEditableFields(body));

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
    // Only admin can delete locations
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    try {
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
    // Only admin can update locations
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();

    try {
        const body = await req.json();
        const _id = body?._id;

        if (!_id) {
            return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
        }

        // Hanya field allowlist yang ditulis. picSubs (kontrol akses), _id,
        // createdAt, updatedAt sengaja tidak pernah masuk update.
        const updateData = pickEditableFields(body);

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
