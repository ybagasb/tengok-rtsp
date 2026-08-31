import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAuth, requireAdmin, getAuditActor } from '@/lib/apiAuth';

export async function GET(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const cameras = await Camera.find({})
            .sort({ createdAt: -1 })
            .lean();
        return NextResponse.json({ success: true, data: cameras });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to fetch cameras' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    // Only admin users can create cameras
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const body = await req.json();
        const actor = await getAuditActor(req);
        const camera = await Camera.create(body);

        // Audit log — fire and forget
        logAudit({
            action: 'CREATE',
            entity: 'Camera',
            entityId: camera._id.toString(),
            entityName: camera.name,
            by: actor,
            detail: `Mendaftarkan kamera: ${camera.name}`,
        });

        return NextResponse.json({ success: true, data: camera }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to create camera' }, { status: 400 });
    }
}
