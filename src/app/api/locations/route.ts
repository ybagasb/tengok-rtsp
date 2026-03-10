import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import Camera from '@/models/Camera';

// Prevent tree-shaking of the Camera model
const _models = [Camera, Location];

export async function GET(req: Request) {
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
            return NextResponse.json({ success: true, data: location });
        }

        const query = category ? { category: category } : {};
        const locations = await Location.find(query).populate('cameras').lean() as any;

        // Calculate online/offline counts
        const enhancedLocations = locations.map((loc: any) => {
            const onlineCount = loc.cameras?.filter((c: any) => c.status === 'online').length || 0;
            const offlineCount = loc.cameras?.filter((c: any) => c.status === 'offline').length || 0;
            return {
                ...loc,
                onlineCount,
                offlineCount
            };
        });

        return NextResponse.json({ success: true, data: enhancedLocations });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    await dbConnect();

    try {
        const body = await req.json();
        const location = await Location.create(body);
        return NextResponse.json({ success: true, data: location }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}

export async function DELETE(req: Request) {
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
        return NextResponse.json({ success: true, data: {} }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
export async function PUT(req: Request) {
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

        return NextResponse.json({ success: true, data: location });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}
