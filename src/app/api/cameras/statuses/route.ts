import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import { requireAuth } from '@/lib/apiAuth';

/**
 * GET /api/cameras/statuses
 * Lightweight endpoint — returns only { _id, status } for all cameras.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

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
