import { NextResponse } from 'next/server';
import { ffmpegManager } from '@/lib/ffmpegManager';

export async function POST(req: Request) {
    try {
        const { cameraId, rtspUrl } = await req.json();
        
        if (!cameraId || !rtspUrl) {
            return NextResponse.json({ error: "Missing cameraId or rtspUrl" }, { status: 400 });
        }

        const hlsUrl = await ffmpegManager.startStream(cameraId, rtspUrl);

        return NextResponse.json({ 
            success: true,
            hlsUrl 
        });
    } catch (error: any) {
        console.error('Failed to start stream:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
