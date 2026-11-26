import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import Location from '@/models/Location';
import { logAudit } from '@/lib/adminAuditLog';
import {
    requireDivisiAdmin, areCamerasAccessibleByDivisi, getAuditActor,
} from '@/lib/apiAuth';

/**
 * POST /api/cameras/bulk
 * Bulk create cameras (e.g. from CSV import)
 * Body: { cameras: Array<{ name: string; streamUrl: string }> }
 */
export async function POST(req: NextRequest) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    await dbConnect();
    try {
        const body = await req.json();
        const { cameras, locationId } = body as {
            cameras: Array<{ name: string; streamUrl: string }>;
            locationId?: string;
        };

        if (!cameras || !Array.isArray(cameras) || cameras.length === 0) {
            return NextResponse.json({ success: false, error: 'Daftar kamera kosong' }, { status: 400 });
        }

        let targetLocName: string | null = null;
        if (locationId) {
            const loc = await Location.findById(locationId).select('name division').lean<{ name: string; division?: string }>();
            if (!loc) {
                return NextResponse.json({ success: false, error: 'Lokasi tujuan tidak ditemukan' }, { status: 404 });
            }
            if (!isSuperAdmin && callerDivisi && loc.division !== callerDivisi) {
                return NextResponse.json({ success: false, error: 'Lokasi tujuan berada di luar divisi Anda' }, { status: 403 });
            }
            targetLocName = loc.name;
        }

        const actor = await getAuditActor(req);
        const validCameras = cameras.filter(c => c.name?.trim() && c.streamUrl?.trim());

        if (validCameras.length === 0) {
            return NextResponse.json({ success: false, error: 'Tidak ada data kamera yang valid' }, { status: 400 });
        }

        const inserted = await Camera.insertMany(
            validCameras.map(c => ({
                name: c.name.trim(),
                streamUrl: c.streamUrl.trim(),
                status: 'offline',
                ...(!isSuperAdmin && callerDivisi ? { division: callerDivisi } : {}),
                createdAt: new Date(),
            }))
        );

        if (locationId && inserted.length > 0) {
            await Location.findByIdAndUpdate(locationId, {
                $addToSet: { cameras: { $each: inserted.map(c => c._id) } },
            });
        }

        logAudit({
            action: 'CREATE',
            entity: 'Camera',
            entityId: 'BULK_IMPORT',
            entityName: `${inserted.length} Kamera (Batch Import)`,
            by: actor,
            detail: `Import massal ${inserted.length} perangkat kamera dari file CSV${targetLocName ? ` ke lokasi ${targetLocName}` : ''}`,
        });

        return NextResponse.json({
            success: true,
            count: inserted.length,
            data: inserted,
        }, { status: 201 });
    } catch (error) {
        console.error('[bulk-create] Error:', error);
        return NextResponse.json({ success: false, error: 'Gagal menyimpan data massal' }, { status: 500 });
    }
}

/**
 * DELETE /api/cameras/bulk
 * Bulk delete cameras
 * Body: { cameraIds: string[] }
 */
export async function DELETE(req: NextRequest) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    await dbConnect();
    try {
        const body = await req.json();
        const { cameraIds } = body as { cameraIds: string[] };

        if (!cameraIds || !Array.isArray(cameraIds) || cameraIds.length === 0) {
            return NextResponse.json({ success: false, error: 'Pilih kamera yang ingin dihapus' }, { status: 400 });
        }

        if (!isSuperAdmin && callerDivisi) {
            if (!(await areCamerasAccessibleByDivisi(cameraIds, callerDivisi))) {
                return NextResponse.json({ success: false, error: 'Terdapat kamera di luar cakupan divisi Anda' }, { status: 403 });
            }
        }

        const actor = await getAuditActor(req);
        const result = await Camera.deleteMany({ _id: { $in: cameraIds } });

        // Also clean up references in Locations
        await Location.updateMany(
            { cameras: { $in: cameraIds } },
            { $pull: { cameras: { $in: cameraIds } } }
        );

        logAudit({
            action: 'DELETE',
            entity: 'Camera',
            entityId: 'BULK_DELETE',
            entityName: `${result.deletedCount} Kamera`,
            by: actor,
            detail: `Menghapus massal ${result.deletedCount} perangkat kamera`,
        });

        return NextResponse.json({
            success: true,
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        console.error('[bulk-delete] Error:', error);
        return NextResponse.json({ success: false, error: 'Gagal menghapus massal' }, { status: 500 });
    }
}

/**
 * PATCH /api/cameras/bulk
 * Bulk assign cameras to a specific location
 * Body: { cameraIds: string[], locationId: string }
 */
export async function PATCH(req: NextRequest) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    await dbConnect();
    try {
        const body = await req.json();
        const { cameraIds, locationId } = body as { cameraIds: string[]; locationId: string };

        if (!cameraIds || !Array.isArray(cameraIds) || cameraIds.length === 0 || !locationId) {
            return NextResponse.json({ success: false, error: 'Data cameraIds dan locationId harus disertakan' }, { status: 400 });
        }

        const actor = await getAuditActor(req);
        const location = await Location.findById(locationId);
        if (!location) {
            return NextResponse.json({ success: false, error: 'Lokasi tujuan tidak ditemukan' }, { status: 404 });
        }

        if (!isSuperAdmin && callerDivisi) {
            if (location.division !== callerDivisi) {
                return NextResponse.json({ success: false, error: 'Lokasi tujuan berada di luar divisi Anda' }, { status: 403 });
            }
            if (!(await areCamerasAccessibleByDivisi(cameraIds, callerDivisi))) {
                return NextResponse.json({ success: false, error: 'Terdapat kamera di luar cakupan divisi Anda' }, { status: 403 });
            }
        }

        // Add cameras to target location without duplicates
        await Location.findByIdAndUpdate(locationId, {
            $addToSet: { cameras: { $each: cameraIds } }
        });

        logAudit({
            action: 'UPDATE',
            entity: 'Location',
            entityId: locationId,
            entityName: location.name,
            by: actor,
            detail: `Menambahkan ${cameraIds.length} kamera ke lokasi: ${location.name}`,
        });

        return NextResponse.json({
            success: true,
            message: `Berhasil menambahkan ${cameraIds.length} kamera ke lokasi ${location.name}`,
        });
    } catch (error) {
        console.error('[bulk-assign] Error:', error);
        return NextResponse.json({ success: false, error: 'Gagal menghubungkan kamera' }, { status: 500 });
    }
}
