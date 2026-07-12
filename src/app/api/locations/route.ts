import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import Camera from '@/models/Camera';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAuth, requireAdmin } from '@/lib/apiAuth';

import '@/lib/cameraStatusChecker';

// Prevent tree-shaking of the Camera model
const _models = [Camera, Location];

/**
 * Strip streamUrl from populated camera objects to avoid credential leakage.
 */
function sanitizeCameras(obj: any) {
    if (obj?.cameras && Array.isArray(obj.cameras)) {
        obj.cameras = obj.cameras.map((cam: any) => {
            const { streamUrl, ...safe } = cam;
            return safe;
        });
    }
    return obj;
}

export async function GET(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const id = searchParams.get('id');

    try {
        if (id) {
            const location = await Location.findById(id).populate('cameras').lean();
            if (!location) {
                return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
            }
            return NextResponse.json({ success: true, data: sanitizeCameras(location) });
        }

        const query = category ? { category: category } : {};
        const locations = await Location.find(query).populate('cameras').lean() as any;

        // Calculate online/offline counts and strip credentials
        const enhancedLocations = locations.map((loc: any) => {
            const onlineCount = loc.cameras?.filter((c: any) => c.status === 'online').length || 0;
            const offlineCount = loc.cameras?.filter((c: any) => c.status === 'offline').length || 0;
            return {
                ...sanitizeCameras(loc),
                onlineCount,
                offlineCount
            };
        });

        return NextResponse.json({ success: true, data: enhancedLocations });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    // Only admin can create locations
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();

    try {
        const body = await req.json();
        const location = await Location.create(body);

        logAudit({
            action: 'CREATE',
            entity: 'Location',
            entityId: location._id.toString(),
            entityName: location.name,
            detail: `Created location: ${location.name} (${location.category})`,
        });

        return NextResponse.json({ success: true, data: location }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}

export async function DELETE(req: NextRequest) {
    // Only admin can delete locations
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    try {
        const deletedLocation = await Location.findByIdAndDelete(id);
        if (!deletedLocation) {
            return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
        }

        logAudit({
            action: 'DELETE',
            entity: 'Location',
            entityId: id,
            entityName: deletedLocation.name,
            detail: `Deleted location: ${deletedLocation.name}`,
        });

        return NextResponse.json({ success: true, data: {} }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    // Only admin can update locations
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();

    try {
        const body = await req.json();
        const { _id, ...updateData } = body;

        if (!_id) {
            return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
        }

        const location = await Location.findByIdAndUpdate(_id, updateData, { new: true, runValidators: true });

        if (!location) {
            return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
        }

        logAudit({
            action: 'UPDATE',
            entity: 'Location',
            entityId: _id,
            entityName: location.name,
            detail: `Updated location: ${location.name}`,
        });

        return NextResponse.json({ success: true, data: location });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}
