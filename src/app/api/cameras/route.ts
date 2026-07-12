import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAuth, requireAdmin } from '@/lib/apiAuth';


export async function GET(req: NextRequest) {
    // Require authentication — no more public access
    const authError = await requireAuth(req);
    if (authError) return authError;

    await dbConnect();
    try {
        // Exclude streamUrl from response to prevent credential exposure
        const cameras = await Camera.find({})
            .select('-streamUrl')
            .sort({ createdAt: -1 });
        return NextResponse.json({ success: true, data: cameras });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to fetch cameras' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    // Only admin (SSO) users can create cameras
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const body = await req.json();
        const camera = await Camera.create(body);

        // Audit log — fire and forget
        logAudit({
            action: 'CREATE',
            entity: 'Camera',
            entityId: camera._id.toString(),
            entityName: camera.name,
            detail: `Created camera: ${camera.name}`,
        });

        // Return response without streamUrl
        const { streamUrl, ...safeCamera } = camera.toObject();
        return NextResponse.json({ success: true, data: safeCamera }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to create camera' }, { status: 400 });
    }
}
