/**
 * CameraStatusChecker
 * 
 * Background service that periodically probes all RTSP cameras
 * in configurable batches and updates their status in MongoDB.
 * 
 * This approach scales to 75+ cameras without overwhelming the server:
 * - Runs silently in the background (not triggered by user requests)
 * - Processes cameras in small concurrent batches (default: 5 at a time)
 * - Saves results to DB so all clients see accurate status instantly on page load
 */

import { spawn } from 'child_process';
import dbConnect from './db';
import Camera from '@/models/Camera';
import { ffmpegManager } from './ffmpegManager';
import { cameraStatusEmitter } from './cameraStatusEmitter';

const BATCH_SIZE = 3;           // Concurrent RTSP probes (keep low to avoid camera connection limits)
const PROBE_TIMEOUT_MS = 12000; // 12s max per camera (ffprobe needs ~8s, +4s buffer)
const CHECK_INTERVAL_MS = 5 * 60 * 1000;  // Background check every 5 minutes (probe-now handles on-demand accuracy)
const INITIAL_DELAY_MS = 5 * 1000;        // Wait 5s after server start before first check

// Probe a single RTSP URL using ffprobe
export function probeCamera(rtspUrl: string): Promise<'online' | 'offline'> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve('offline');
        }, PROBE_TIMEOUT_MS);

        const proc = spawn('ffprobe', [
            '-rtsp_transport', 'tcp',
            '-timeout', '8000000',          // 8s RTSP handshake timeout
            '-v', 'quiet',                  // Suppress all logs
            '-print_format', 'json',
            '-show_streams',
            '-i', rtspUrl
        ]);

        let hasOutput = false;
        proc.stdout?.on('data', () => { hasOutput = true; });
        proc.stderr?.on('data', () => {}); // Suppress stderr

        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve(code === 0 || hasOutput ? 'online' : 'offline');
        });

        proc.on('error', () => {
            clearTimeout(timer);
            resolve('offline');
        });
    });
}

// Process an array in chunks of `size` concurrently, sequentially per batch
export async function runInBatches<T>(
    items: T[],
    size: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    for (let i = 0; i < items.length; i += size) {
        const batch = items.slice(i, i + size);
        await Promise.all(batch.map(fn));
    }
}

class CameraStatusChecker {
    private timer: NodeJS.Timeout | null = null;
    private isRunning = false;

    start() {
        console.log(`[StatusChecker] Started — first check in ${INITIAL_DELAY_MS / 1000}s, then every ${CHECK_INTERVAL_MS / 60000} min`);
        // Delay first check so server can fully start up
        setTimeout(() => {
            this.runCheck();
            this.timer = setInterval(() => this.runCheck(), CHECK_INTERVAL_MS);
        }, INITIAL_DELAY_MS);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async runCheck() {
        if (this.isRunning) {
            console.log('[StatusChecker] Previous check still running, skipping...');
            return;
        }
        this.isRunning = true;
        const startTime = Date.now();

        try {
            await dbConnect();
            const cameras = await Camera.find({ streamUrl: { $exists: true, $ne: '' } })
                .select('_id streamUrl')
                .lean();

            if (cameras.length === 0) return;

            // Skip cameras that are currently being actively streamed
            // to avoid RTSP connection conflicts (many cameras only allow 1 connection)
            const camerasToProbe = cameras.filter((cam: any) => !ffmpegManager.isStreaming(cam._id.toString()));
            const skipped = cameras.length - camerasToProbe.length;
            if (skipped > 0) console.log(`[StatusChecker] Skipping ${skipped} camera(s) with active streams`);

            console.log(`[StatusChecker] Probing ${camerasToProbe.length} cameras in batches of ${BATCH_SIZE}...`);

            let onlineCount = 0;
            let offlineCount = 0;

            await runInBatches(camerasToProbe, BATCH_SIZE, async (cam: any) => {
                const status = await probeCamera(cam.streamUrl);
                if (status === 'online') onlineCount++;
                else offlineCount++;
                await Camera.updateOne({ _id: cam._id }, { $set: { status } });
                // Push status to all connected SSE clients immediately
                cameraStatusEmitter.emit('status', { cameraId: cam._id.toString(), status });
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[StatusChecker] Done in ${elapsed}s → ${onlineCount} online, ${offlineCount} offline`);

        } catch (err: any) {
            console.error('[StatusChecker] Error:', err.message);
        } finally {
            this.isRunning = false;
        }
    }
}

// Singleton — survives HMR in Next.js dev mode
const globalForChecker = global as unknown as { cameraStatusChecker?: CameraStatusChecker };

if (!globalForChecker.cameraStatusChecker) {
    globalForChecker.cameraStatusChecker = new CameraStatusChecker();
    globalForChecker.cameraStatusChecker.start();
}

export const cameraStatusChecker = globalForChecker.cameraStatusChecker;
