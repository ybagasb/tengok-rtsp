import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import Location from '@/models/Location';
import { logAudit } from '@/lib/adminAuditLog';
import {
    requireAuth, requireDivisiAdmin, getDivisiCameraIds, getAuditActor,
} from '@/lib/apiAuth';
import { pickCameraFields } from '@/lib/cameraFields';

export async function GET(req: NextRequest) {
    try {
        // streamUrl embeds RTSP credentials, so it is stripped by default and
        // only returned when explicitly requested. Flag ini KHUSUS admin (superadmin/divisi_admin).
        const includeStreamUrl = req.nextUrl.searchParams.get('includeStreamUrl') === '1';
        const scope = req.nextUrl.searchParams.get('scope');

        let callerDivisi: import('@/models/AppRole').DivisiName | null = null;
        let isSuperAdmin = true;

        if (includeStreamUrl || scope === 'admin') {
            const authResult = await requireDivisiAdmin(req);
            if ('error' in authResult) return authResult.error;
            callerDivisi = authResult.divisi;
            isSuperAdmin = authResult.isSuperAdmin;
        } else {
            const authError = await requireAuth(req);
            if (authError) return authError;
        }

        await dbConnect();

        let filter: Record<string, unknown> = {};
        if (!isSuperAdmin && callerDivisi) {
            const allowedIds = await getDivisiCameraIds(callerDivisi);
            filter = { _id: { $in: allowedIds } };
        }

        const query = Camera.find(filter).sort({ createdAt: -1 });
        if (!includeStreamUrl) query.select('-streamUrl');

        const cameras = await query.lean();
        return NextResponse.json({ success: true, data: cameras });
    } catch {
        return NextResponse.json({ success: false, error: 'Failed to fetch cameras' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    // Super-admin atau admin divisi dapat mendaftarkan kamera
    const authResult = await requireDivisiAdmin(req);
    if ('error' in authResult) return authResult.error;
    const { divisi: callerDivisi, isSuperAdmin } = authResult;

    await dbConnect();
    try {
        const body = await req.json();
        const fields = pickCameraFields(body);
        if (!isSuperAdmin && callerDivisi) {
            fields.division = callerDivisi;
        } else if (fields.division === '') {
            fields.division = null;
        }

        // Opsional: langsung tautkan ke lokasi proyek saat pendaftaran kamera
        const locationIds = Array.isArray(body?.locationIds)
            ? [...new Set(body.locationIds.map((x: unknown) => String(x).trim()).filter(Boolean))]
            : [];

        if (locationIds.length > 0 && !isSuperAdmin && callerDivisi) {
            const countValid = await Location.countDocuments({
                _id: { $in: locationIds },
                division: callerDivisi,
            });
            if (countValid !== locationIds.length) {
                return NextResponse.json(
                    { success: false, error: 'Lokasi tujuan berada di luar divisi Anda' },
                    { status: 403 },
                );
            }
        }

        const actor = await getAuditActor(req);
        const camera = await Camera.create(fields);

        if (locationIds.length > 0) {
            await Location.updateMany(
                { _id: { $in: locationIds } },
                { $addToSet: { cameras: camera._id } },
            );
        }

        // Audit log — tunggu commit sebelum merespons (jejak privilese).
        await logAudit({
            action: 'CREATE',
            entity: 'Camera',
            entityId: camera._id.toString(),
            entityName: camera.name,
            by: actor,
            detail: `Mendaftarkan kamera: ${camera.name}${fields.division ? ` (${fields.division})` : ''}${locationIds.length > 0 ? ` → ditautkan ke ${locationIds.length} lokasi` : ''}`,
        });

        return NextResponse.json({ success: true, data: camera }, { status: 201 });
    } catch {
        return NextResponse.json({ success: false, error: 'Failed to create camera' }, { status: 400 });
    }
}
