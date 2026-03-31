import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';

/**
 * GET /api/cameras/statuses
 * Lightweight endpoint — returns only { _id, status } for all cameras.
 * Used by MapComponent to poll camera statuses every few seconds
 * without fetching the full location/camera payload.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await dbConnect();
        const cameras = await Camera.find({})
            .select('_id status')
            .lean();

        return NextResponse.json({ success: true, data: cameras });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to fetch statuses' }, { status: 500 });
    }
}
