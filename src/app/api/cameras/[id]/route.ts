import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import Location from '@/models/Location';
import { logAudit } from '@/lib/adminAuditLog';
import {
    requireDivisiAdmin, areCamerasAccessibleByDivisi, getAuditActor,
} from '@/lib/apiAuth';
import { pickCameraFields } from '@/lib/cameraFields';

export async function DELETE(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    const params = await props.params;
    await dbConnect();
    try {
        const { id } = params;
        if (!isSuperAdmin && callerDivisi) {
            if (!(await areCamerasAccessibleByDivisi([id], callerDivisi))) {
                return NextResponse.json({ success: false, error: 'Kamera ini di luar cakupan divisi Anda' }, { status: 403 });
            }
        }

        const actor = await getAuditActor(req);
        const deletedCamera = await Camera.findByIdAndDelete(id);

        if (!deletedCamera) {
            return NextResponse.json({ success: false, error: 'Camera not found' }, { status: 404 });
        }

        // Clean up references so no location keeps a dangling camera id.
        // (Mirrors the bulk-delete path which already does this.)
        await Location.updateMany(
            { cameras: id },
            { $pull: { cameras: id } }
        );

        // Audit log — tunggu commit sebelum merespons (jejak privilese).
        await logAudit({
            action: 'DELETE',
            entity: 'Camera',
            entityId: id,
            entityName: deletedCamera.name,
            by: actor,
            detail: `Menghapus kamera: ${deletedCamera.name}`,
        });

        return NextResponse.json({ success: true, data: {} });
    } catch {
        return NextResponse.json({ success: false, error: 'Failed to delete camera' }, { status: 400 });
    }
}

export async function PUT(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    const params = await props.params;
    await dbConnect();
    try {
        const { id } = params;
        if (!isSuperAdmin && callerDivisi) {
            if (!(await areCamerasAccessibleByDivisi([id], callerDivisi))) {
                return NextResponse.json({ success: false, error: 'Kamera ini di luar cakupan divisi Anda' }, { status: 403 });
            }
        }

        const body = await req.json();
        const fields = pickCameraFields(body);
        if (!isSuperAdmin && callerDivisi) {
            // Divisi admin tidak boleh memindahkan kamera ke divisi lain
            fields.division = callerDivisi;
        }

        const hasLocationIds = Array.isArray(body?.locationIds);
        const targetLocationIds: string[] = hasLocationIds
            ? Array.from(new Set<string>(body.locationIds.map((x: unknown) => String(x).trim()).filter(Boolean)))
            : [];

        if (hasLocationIds && targetLocationIds.length > 0 && !isSuperAdmin && callerDivisi) {
            const invalidLoc = await Location.exists({
                _id: { $in: targetLocationIds },
                division: { $ne: callerDivisi },
            });
            if (invalidLoc) {
                return NextResponse.json(
                    { success: false, error: 'Lokasi tujuan berada di luar divisi Anda' },
                    { status: 403 },
                );
            }
        }

        const actor = await getAuditActor(req);
        const camera = await Camera.findByIdAndUpdate(id, fields, {
            new: true,
            runValidators: true,
        });

        if (!camera) {
            return NextResponse.json({ success: false, error: 'Camera not found' }, { status: 404 });
        }

        if (hasLocationIds) {
            const pullScope: Record<string, unknown> = {
                cameras: id,
                ...(targetLocationIds.length > 0 ? { _id: { $nin: targetLocationIds } } : {}),
            };
            if (!isSuperAdmin && callerDivisi) {
                pullScope.division = callerDivisi;
            }
            await Location.updateMany(pullScope, { $pull: { cameras: id } });
            if (targetLocationIds.length > 0) {
                await Location.updateMany(
                    { _id: { $in: targetLocationIds } },
                    { $addToSet: { cameras: id } },
                );
            }
        }

        // Audit log — tunggu commit sebelum merespons (jejak privilese).
        await logAudit({
            action: 'UPDATE',
            entity: 'Camera',
            entityId: id,
            entityName: camera.name,
            by: actor,
            detail: `Memperbarui konfigurasi kamera: ${camera.name}`,
        });

        return NextResponse.json({ success: true, data: camera });
    } catch {
        return NextResponse.json({ success: false, error: 'Failed to update camera' }, { status: 400 });
    }
}
