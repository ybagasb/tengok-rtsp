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

        ffmpegManager.heartbeat(cameraId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed heartbeat:', error);
        return NextResponse.json({ error: 'Gagal memperbarui heartbeat stream' }, { status: 500 });
    }
}
