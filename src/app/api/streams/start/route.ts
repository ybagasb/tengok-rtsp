import { NextRequest, NextResponse } from 'next/server';
import { ffmpegManager } from '@/lib/ffmpegManager';
import dbConnect from '@/lib/db';
import Camera from '@/models/Camera';
import { requireAuth } from '@/lib/apiAuth';

// ── Simple in-memory rate limiter ───────────────────────────────────────────
// Max 5 stream-start requests per IP within a 30-second window.
// Suitable for single-server deployments. Use Redis for horizontal scale.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 30_000;

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }

    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) return true;
    return false;
}

// Periodically clean up expired entries to avoid memory leak
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
}, 60_000);

// ────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    // Rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? req.headers.get('x-real-ip')
        ?? 'unknown';

    if (isRateLimited(ip)) {
        return NextResponse.json(
            { error: 'Too many stream requests. Please wait a moment.' },
            { status: 429 }
        );
    }

    try {
        const { cameraId } = await req.json();

        if (!cameraId || typeof cameraId !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid cameraId' }, { status: 400 });
        }

        // ── Lookup RTSP URL server-side — never trust client-provided URLs ──
        await dbConnect();
        const camera = await Camera.findById(cameraId).select('streamUrl').lean() as { streamUrl: string } | null;

        if (!camera) {
            return NextResponse.json({ error: 'Camera not found' }, { status: 404 });
        }

        if (!camera.streamUrl) {
            return NextResponse.json({ error: 'Camera has no stream URL configured' }, { status: 400 });
        }

        const hlsUrl = await ffmpegManager.startStream(cameraId, camera.streamUrl);

        return NextResponse.json({ success: true, hlsUrl });
    } catch (error: any) {
        // Log full detail server-side (may contain ffmpeg stderr with the RTSP
        // URL + credentials) but NEVER leak it to the client.
        console.error('Failed to start stream:', error?.message || error);
        return NextResponse.json(
            { success: false, error: 'Gagal memulai stream. Silakan coba lagi.' },
            { status: 500 }
        );
    }
}
