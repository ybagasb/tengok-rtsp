import { NextRequest, NextResponse } from 'next/server';
import { ffmpegManager } from '@/lib/ffmpegManager';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import { requireAuth } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-side safety cap: never pre-warm more than this many streams per call,
// regardless of how many ids the client sends. The client should already
// prioritise online cameras and cap its list, but this is the hard backstop.
const PREWARM_CAP = 20;
// Start in small batches with a short gap so a map load doesn't spawn a large
// number of ffmpeg processes all at once.
const BATCH_SIZE = 5;
const BATCH_GAP_MS = 400;

// Prevent a single busy server from stacking many concurrent prewarm sweeps.
let isPrewarming = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /api/streams/prewarm
 * Body: { cameraIds: string[] }
 *
 * Fire-and-forget: eagerly starts ffmpeg for the given cameras so their HLS
 * segments are ready before a viewer clicks. Only cameras that are `online`
 * and not already streaming are warmed. Idle streams are reaped by the
 * ffmpegManager idle-timeout, so nothing needs to explicitly stop them.
 */
export async function POST(req: NextRequest) {
    const authError = await requireAuth(req);
    if (authError) return authError;

    const body = await req.json().catch(() => ({}));
    const { cameraIds }: { cameraIds?: string[] } = body;

    if (!Array.isArray(cameraIds) || cameraIds.length === 0) {
        return NextResponse.json({ message: 'No camera IDs provided' }, { status: 400 });
    }

    if (isPrewarming) {
        return NextResponse.json({ message: 'Prewarm already in progress' }, { status: 202 });
    }

    // Work happens after the response so the UI never blocks on warmup.
    (async () => {
        isPrewarming = true;
        try {
            await dbConnect();

            // Only warm online cameras that have a usable stream URL. Preserve
            // the client's ordering (it sends online-first), then apply the cap.
            const capped = cameraIds.slice(0, PREWARM_CAP);
            const cameras = await Camera.find({
                _id: { $in: capped },
                status: 'online',
                streamUrl: { $exists: true, $ne: '' },
            })
                .select('_id streamUrl')
                .lean();

            // Skip cameras already streaming (viewer or a previous prewarm).
            const targets = (cameras as any[]).filter(
                (cam) => !ffmpegManager.isStreaming(cam._id.toString())
            );

            if (targets.length === 0) return;
            console.log(`[Prewarm] Warming ${targets.length} camera(s) (cap=${PREWARM_CAP}, batch=${BATCH_SIZE})...`);

            for (let i = 0; i < targets.length; i += BATCH_SIZE) {
                const batch = targets.slice(i, i + BATCH_SIZE);
                // Don't await readiness — just kick off ffmpeg. Failures (offline
                // between status check and now, single-connection cameras) are
                // swallowed; the viewer path will surface real errors later.
                await Promise.all(
                    batch.map((cam) =>
                        ffmpegManager
                            .startStream(cam._id.toString(), cam.streamUrl)
                            .catch(() => { /* best-effort warmup */ })
                    )
                );
                if (i + BATCH_SIZE < targets.length) await sleep(BATCH_GAP_MS);
            }

            console.log('[Prewarm] Done.');
        } catch (err: any) {
            console.error('[Prewarm] Error:', err?.message || err);
        } finally {
            isPrewarming = false;
        }
    })().catch(() => { isPrewarming = false; });

    return NextResponse.json({ message: 'Prewarm started', count: cameraIds.length }, { status: 202 });
}
