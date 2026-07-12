import { NextRequest, NextResponse } from 'next/server';
import '@/lib/cameraStatusChecker'; // Ensure background checker singleton is initialized
import { cameraStatusEmitter } from '@/lib/cameraStatusEmitter';
import { ffmpegManager } from '@/lib/ffmpegManager';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import StatusLog from '@/models/StatusLog';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Prevent duplicate concurrent probes
let isProbing = false;

/**
 * POST /api/cameras/probe-now
 * Body: { cameraIds: string[] }
 *
 * Admin-only. Triggers HLS pipeline test for selected cameras.
 */
export async function POST(req: NextRequest) {
    // Only admin can trigger probes
    const authError = await requireAdmin(req);
    if (authError) return authError;

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
                .select('_id streamUrl status')
                .lean();

            const BATCH_SIZE = 3;
            console.log(`[ProbeNow] Testing full HLS pipeline for ${cameras.length} cameras (batch=${BATCH_SIZE})...`);

            for (let i = 0; i < cameras.length; i += BATCH_SIZE) {
                const batch = (cameras as any[]).slice(i, i + BATCH_SIZE);

                await Promise.all(batch.map(async (cam: any) => {
                    // Already streaming = confirmed live → mark online immediately
                    if (ffmpegManager.isStreaming(cam._id.toString())) {
                        const now = new Date();
                        const payload = { cameraId: cam._id.toString(), status: 'online' as const, lastCheckedAt: now.toISOString() };
                        await Camera.updateOne({ _id: cam._id }, { $set: { status: 'online', lastCheckedAt: now, lastOnlineAt: now } });
                        if (cam.status !== 'online') {
                            await StatusLog.create({ cameraId: cam._id, status: 'online', checkedBy: 'probe' });
                        }
                        cameraStatusEmitter.emit('status', payload);
                        return;
                    }

                    let status: 'online' | 'offline' = 'offline';
                    try {
                        // Test the full pipeline: ffmpeg transcodes RTSP → HLS
                        await ffmpegManager.startStream(cam._id.toString(), cam.streamUrl);

                        // Wait 3s stability check
                        await new Promise(r => setTimeout(r, 3000));

                        status = ffmpegManager.isStreaming(cam._id.toString()) ? 'online' : 'offline';

                        if (status === 'offline') {
                            try { ffmpegManager.stopStream(cam._id.toString()); } catch { /* ignore */ }
                        }
                    } catch {
                        status = 'offline';
                        try { ffmpegManager.stopStream(cam._id.toString()); } catch { /* ignore */ }
                    }

                    // Write to DB immediately
                    const now = new Date();
                    const updateFields: Record<string, any> = { status, lastCheckedAt: now };
                    if (status === 'online') {
                        updateFields.lastOnlineAt = now;
                    }
                    await Camera.updateOne({ _id: cam._id }, { $set: updateFields });
                    if (cam.status !== status) {
                        await StatusLog.create({ cameraId: cam._id, status, checkedBy: 'probe' });
                    }
                    cameraStatusEmitter.emit('status', { cameraId: cam._id.toString(), status, lastCheckedAt: now.toISOString() });
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
