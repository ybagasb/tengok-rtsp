import { NextRequest, NextResponse } from 'next/server';
import '@/lib/cameraStatusChecker'; // Ensure background checker singleton is initialized
import { cameraStatusEmitter } from '@/lib/cameraStatusEmitter';
import { ffmpegManager } from '@/lib/ffmpegManager';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Prevent duplicate concurrent probes
let isProbing = false;

/**
 * POST /api/cameras/probe-now
 * Body: { cameraIds: string[] }
 *
 * Returns 202 immediately. In the background:
 * - Starts the full ffmpeg → HLS pipeline for each camera
 * - Waits 3s to verify stability (catches streams that start then crash)
 * - Writes result to DB immediately → picked up by the 3s polling in MapComponent
 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const { cameraIds }: { cameraIds?: string[] } = body;

    if (!cameraIds || cameraIds.length === 0) {
        return NextResponse.json({ message: 'No camera IDs provided' }, { status: 400 });
    }

    if (isProbing) {
        return NextResponse.json({ message: 'Probe already in progress' }, { status: 202 });
    }

    // Fire and forget — return 202 immediately so the UI doesn't block
    (async () => {
        isProbing = true;
        try {
            await dbConnect();
            const cameras = await Camera.find({ _id: { $in: cameraIds }, streamUrl: { $exists: true, $ne: '' } })
                .select('_id streamUrl')
                .lean();

            const BATCH_SIZE = 3;
            console.log(`[ProbeNow] Testing full HLS pipeline for ${cameras.length} cameras (batch=${BATCH_SIZE})...`);

            for (let i = 0; i < cameras.length; i += BATCH_SIZE) {
                const batch = (cameras as any[]).slice(i, i + BATCH_SIZE);

                await Promise.all(batch.map(async (cam: any) => {
                    // Already streaming = confirmed live → mark online immediately
                    if (ffmpegManager.isStreaming(cam._id.toString())) {
                        const payload = { cameraId: cam._id.toString(), status: 'online' as const };
                        await Camera.updateOne({ _id: cam._id }, { $set: { status: 'online' } });
                        cameraStatusEmitter.emit('status', payload);
                        return;
                    }

                    let status: 'online' | 'offline' = 'offline';
                    try {
                        // Test the full pipeline: ffmpeg transcodes RTSP → HLS
                        await ffmpegManager.startStream(cam._id.toString(), cam.streamUrl);

                        // Wait 3s stability check: catches streams that start then immediately crash
                        await new Promise(r => setTimeout(r, 3000));

                        status = ffmpegManager.isStreaming(cam._id.toString()) ? 'online' : 'offline';

                        if (status === 'offline') {
                            try { ffmpegManager.stopStream(cam._id.toString()); } catch { /* ignore */ }
                        }
                        // If online, leave stream alive — user may open it immediately
                    } catch {
                        status = 'offline';
                        try { ffmpegManager.stopStream(cam._id.toString()); } catch { /* ignore */ }
                    }

                    // Write to DB immediately — MapComponent's 3s polling will pick this up
                    await Camera.updateOne({ _id: cam._id }, { $set: { status } });
                    cameraStatusEmitter.emit('status', { cameraId: cam._id.toString(), status });
                }));
            }

            console.log(`[ProbeNow] Done.`);
        } catch (err: any) {
            console.error('[ProbeNow] Error:', err.message);
        } finally {
            isProbing = false;
        }
    })().catch(() => { isProbing = false; });

    return NextResponse.json({ message: 'Probe started', count: cameraIds.length }, { status: 202 });
}
