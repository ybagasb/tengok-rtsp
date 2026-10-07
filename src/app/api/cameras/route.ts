import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAuth, requireAdmin, getAuditActor } from '@/lib/apiAuth';

// Field kamera yang boleh ditulis lewat create/update. Hanya field yang ada di
// schema Camera; body mentah tidak boleh di-$set langsung agar tidak ada field
// tak terduga yang tersisip.
const CAMERA_EDITABLE_FIELDS = [
    'name', 'streamUrl', 'status', 'lastCheckedAt', 'lastOnlineAt',
] as const;

/** Salin HANYA key allowlist dari body kamera. */
export function pickCameraFields(body: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const field of CAMERA_EDITABLE_FIELDS) {
        if (field in body) out[field] = body[field];
    }
    return out;
}

export async function GET(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    try {
        // streamUrl embeds RTSP credentials, so it is stripped by default and
        // only returned when explicitly requested. Flag ini KHUSUS admin: hanya
        // sesi SSO yang boleh menerima streamUrl. Viewer PIN (requireAuth) tetap
        // lolos untuk daftar kamera, tapi tanpa kredensial RTSP.
        const includeStreamUrl = req.nextUrl.searchParams.get('includeStreamUrl') === '1';
        if (includeStreamUrl) {
            const adminError = await requireAdmin(req);
            if (adminError) return adminError;
        }

        await dbConnect();

        const query = Camera.find({}).sort({ createdAt: -1 });
        if (!includeStreamUrl) query.select('-streamUrl');

        const cameras = await query.lean();
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
        const camera = await Camera.create(pickCameraFields(body));

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
