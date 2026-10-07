import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { requireAdmin } from '@/lib/apiAuth';
import { isRtspUrl } from '@/lib/urlGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function probeStream(streamUrl: string): Promise<{ success: boolean; codec?: string; error?: string }> {
    return new Promise((resolve) => {
        let isResolved = false;

        const timeout = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                proc.kill('SIGKILL');
                resolve({ success: false, error: 'Connection timed out (8s)' });
            }
        }, 8000);

        const args = [
            '-rtsp_transport', 'tcp',
            '-timeout', '6000000',
            '-v', 'error',
            '-show_entries', 'stream=codec_name,codec_type,width,height',
            '-of', 'json',
            '-i', streamUrl,
        ];

        const proc = spawn('ffprobe', args);
        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);

            if (code === 0 && stdout) {
                try {
                    const parsed = JSON.parse(stdout);
                    const videoStream = parsed.streams?.find((s: any) => s.codec_type === 'video');
                    const codec = videoStream ? `${videoStream.codec_name} (${videoStream.width}x${videoStream.height})` : 'Audio/Other';
                    resolve({ success: true, codec });
                } catch {
                    resolve({ success: true, codec: 'Stream OK' });
                }
            } else {
                resolve({ success: false, error: stderr.trim() || 'Tidak dapat membaca stream RTSP/HLS' });
            }
        });

        proc.on('error', (err) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            resolve({ success: false, error: err.message });
        });
    });
}

export async function POST(req: NextRequest) {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { streamUrl } = body;

        if (!streamUrl || typeof streamUrl !== 'string') {
            return NextResponse.json({ success: false, error: 'Stream URL harus diisi' }, { status: 400 });
        }

        // Anti-SSRF: endpoint ini khusus menguji URL RTSP yang belum tersimpan.
        // Tolak selain skema rtsp: dan host internal/loopback/link-local/metadata.
        if (!isRtspUrl(streamUrl.trim())) {
            return NextResponse.json(
                { success: false, error: 'URL harus berupa rtsp:// dan bukan host internal.' },
                { status: 400 },
            );
        }

        const result = await probeStream(streamUrl.trim());
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
