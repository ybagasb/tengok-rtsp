import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAdmin } from '@/lib/apiAuth';

export async function DELETE(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    // Only admin (SSO) users can delete cameras
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const params = await props.params;
    await dbConnect();
    try {
        const { id } = params;
        const deletedCamera = await Camera.findByIdAndDelete(id);

        if (!deletedCamera) {
            return NextResponse.json({ success: false, error: 'Camera not found' }, { status: 404 });
        }

        // Audit log — fire and forget (don't log streamUrl!)
        logAudit({
            action: 'DELETE',
            entity: 'Camera',
            entityId: id,
            entityName: deletedCamera.name,
            detail: `Deleted camera: ${deletedCamera.name}`,
        });

        return NextResponse.json({ success: true, data: {} });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to delete camera' }, { status: 400 });
    }
}

export async function PUT(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    // Only admin (SSO) users can update cameras
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const params = await props.params;
    await dbConnect();
    try {
        const { id } = params;
        const body = await req.json();
        const camera = await Camera.findByIdAndUpdate(id, body, {
            new: true,
            runValidators: true,
        });

        if (!camera) {
            return NextResponse.json({ success: false, error: 'Camera not found' }, { status: 404 });
        }

        // Audit log — fire and forget
        logAudit({
            action: 'UPDATE',
            entity: 'Camera',
            entityId: id,
            entityName: camera.name,
            detail: `Updated camera: ${camera.name}`,
        });

        // Return response without streamUrl
        const { streamUrl, ...safeCamera } = camera.toObject();
        return NextResponse.json({ success: true, data: safeCamera });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to update camera' }, { status: 400 });
    }
}
