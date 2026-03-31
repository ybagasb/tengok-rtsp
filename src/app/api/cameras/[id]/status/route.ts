import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';

/**
 * PATCH /api/cameras/[id]/status
 * Body: { status: 'online' | 'offline' }
 *
 * Lightweight endpoint called by the video player when it detects a status
 * change in real-time. This persists the player-confirmed status to DB so
 * the 3s polling reflects the accurate, verified status.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { status } = await req.json();

        if (!status || !['online', 'offline'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        await dbConnect();
        await Camera.updateOne({ _id: id }, { $set: { status } });

        return NextResponse.json({ success: true, id, status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
