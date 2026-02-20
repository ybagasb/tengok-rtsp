import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';

export async function GET() {
    await dbConnect();
    try {
        const cameras = await Camera.find({}).sort({ createdAt: -1 });
        return NextResponse.json({ success: true, data: cameras });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to fetch cameras' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    await dbConnect();
    try {
        const body = await req.json();
        const camera = await Camera.create(body);
        return NextResponse.json({ success: true, data: camera }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to create camera' }, { status: 400 });
    }
}
