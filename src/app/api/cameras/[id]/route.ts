import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';

export async function DELETE(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    await dbConnect();
    try {
        const { id } = params;
        const deletedCamera = await Camera.findByIdAndDelete(id);

        if (!deletedCamera) {
            return NextResponse.json({ success: false, error: 'Camera not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: {} });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to delete camera' }, { status: 400 });
    }
}

export async function PUT(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    await dbConnect();
    try {
        const { id } = params;
        const body = await req.json();
        const camera = await Camera.findByIdAndUpdate(id, body, {
            new: true,
            runValidators: true,
        });

        if (!camera) {
            return NextResponse.json({ success: false, error: 'Camera not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: camera });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to update camera' }, { status: 400 });
    }
}
