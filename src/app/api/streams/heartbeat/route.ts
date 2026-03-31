import { NextResponse } from 'next/server';
import { ffmpegManager } from '@/lib/ffmpegManager';

export async function POST(req: Request) {
    try {
        const { cameraId } = await req.json();
        
        if (!cameraId) {
            return NextResponse.json({ error: "Missing cameraId" }, { status: 400 });
        }

        ffmpegManager.heartbeat(cameraId);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Failed heartbeat:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
