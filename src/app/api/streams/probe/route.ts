import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { requireAdmin } from '@/lib/apiAuth';

// Quick check if an RTSP stream is reachable using ffprobe
// Much faster than starting a full FFmpeg transcode
function probeRtsp(rtspUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve(false);
        }, 8000); // 8 second max wait

        const proc = spawn('ffprobe', [
            '-rtsp_transport', 'tcp',
            '-timeout', '6000000',  // 6s RTSP timeout (microseconds)
            '-v', 'error',
            '-show_entries', 'stream=codec_type',
            '-of', 'default=noprint_wrappers=1',
            '-i', rtspUrl
        ]);

        let stdout = '';
        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });

        proc.on('close', (code) => {
            clearTimeout(timeout);
            // If ffprobe found at least one stream (video or audio) → online
            resolve(code === 0 || stdout.includes('codec_type'));
        });

        proc.on('error', () => {
            clearTimeout(timeout);
            resolve(false);
        });
    });
}

export async function POST(req: NextRequest) {
    // Only admin can probe RTSP streams (contains credentials)
    const authError = await requireAdmin(req);
    if (authError) return authError;

    try {
        const { cameras } = await req.json() as {
            cameras: { cameraId: string; rtspUrl: string }[];
        };

        if (!cameras || !Array.isArray(cameras)) {
            return NextResponse.json({ error: 'Missing cameras array' }, { status: 400 });
        }

        // Probe all cameras concurrently
        const results = await Promise.all(
            cameras.map(async ({ cameraId, rtspUrl }) => {
                const isOnline = await probeRtsp(rtspUrl);
                return { cameraId, status: isOnline ? 'online' : 'offline' };
            })
        );

        return NextResponse.json({ success: true, results });
    } catch (error) {
        console.error('[probe] Error:', error instanceof Error ? error.message : undefined);
        return NextResponse.json({ error: 'Gagal memeriksa stream' }, { status: 500 });
    }
}
