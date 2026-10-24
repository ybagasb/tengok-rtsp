import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import Location from '@/models/Location';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAdmin, getAuditActor } from '@/lib/apiAuth';
import { pickCameraFields } from '@/lib/cameraFields';

export async function DELETE(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    // Only admin users can delete cameras
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const params = await props.params;
    await dbConnect();
    try {
        const { id } = params;
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
    // Only admin users can update cameras
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const params = await props.params;
    await dbConnect();
    try {
        const { id } = params;
        const body = await req.json();
        const actor = await getAuditActor(req);
        const camera = await Camera.findByIdAndUpdate(id, pickCameraFields(body), {
            new: true,
            runValidators: true,
        });

        if (!camera) {
            return NextResponse.json({ success: false, error: 'Camera not found' }, { status: 404 });
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
