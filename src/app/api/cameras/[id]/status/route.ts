import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import StatusLog from '@/models/StatusLog';
import { cameraStatusEmitter } from '@/lib/cameraStatusEmitter';
import { requireAuth } from '@/lib/apiAuth';

/**
 * PATCH /api/cameras/[id]/status
 * Body: { status: 'online' | 'offline' }
 *
 * Called by the video player when it confirms a camera's real status.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    try {
        const { id } = await params;
        const { status } = await req.json();

        if (!status || !['online', 'offline'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        await dbConnect();
        const now = new Date();

        // Get current status to check if changed
        const camera = await Camera.findById(id).select('status').lean<{ status?: string }>();
        const previousStatus = camera?.status;

        // Update DB with status and timestamp
        const updateFields: Record<string, unknown> = { status, lastCheckedAt: now };
        if (status === 'online') {
            updateFields.lastOnlineAt = now;
        }
        await Camera.updateOne({ _id: id }, { $set: updateFields });

        // Log status change (only if actually changed)
        if (previousStatus && previousStatus !== status) {
            await StatusLog.create({ cameraId: id, status, checkedBy: 'stream' });
        }

        // Broadcast to all SSE clients so map updates instantly
        cameraStatusEmitter.emit('status', {
            cameraId: id,
            status,
            lastCheckedAt: now.toISOString(),
        });

        return NextResponse.json({ success: true, id, status });
    } catch (error) {
        console.error('[camera status] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ error: 'Gagal memperbarui status kamera' }, { status: 500 });
    }
}
