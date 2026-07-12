import { NextRequest, NextResponse } from 'next/server';
import { ffmpegManager } from '@/lib/ffmpegManager';
import { requireAuth } from '@/lib/apiAuth';

export async function POST(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    try {
        const { cameraId } = await req.json();
        
        if (!cameraId) {
            return NextResponse.json({ error: "Missing cameraId" }, { status: 400 });
        }

        ffmpegManager.stopStream(cameraId);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Failed stopping stream:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
